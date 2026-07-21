import { daysUntil, listingExpiration } from "@/lib/listing-badges";
import { nextEntryAt } from "@/lib/sweep-routine";
import type { EntryFrequency } from "@/lib/types/listing";

// Seeker Reminder planner — the pure math behind proactive re-entry and
// ending-soon nudges. It answers, per user, "which of the sweeps this person
// is tracking need a reminder right now, and once each?"
//
// This is "Sweepza remembers so you don't have to," made proactive: the same
// cadence primitives that power Today (nextEntryAt / daysUntil) decide when to
// reach out. Kept pure and DB-free so it is fully unit-testable; the cron in
// app/api/cron/seeker-reminders wires it to Supabase, notification_pref, and
// Resend.

const ENDING_SOON_DAYS = 3;
/** Shared production/preview cap so the operator view cannot overstate a digest. */
export const MAX_ITEMS_PER_REMINDER_DIGEST = 12;

export type SeekerReminderType = "ready_again" | "ends_today" | "ending_soon";

/** Minimal listing shape a reminder needs — decoupled from the full adapter. */
export interface ReminderListing {
  id: string;
  slug: string;
  title: string;
  endDate: string;
  entryFrequency: EntryFrequency;
}

/** The seeker's per-listing action timestamps (nullable straight from the row). */
export interface ReminderActivity {
  savedAt?: string | null;
  enteredAt?: string | null;
  skippedAt?: string | null;
  wonAt?: string | null;
}

export interface ReminderCandidate {
  listing: ReminderListing;
  activity: ReminderActivity;
}

/** Per-event opt-ins, mapped from notification_pref. Missing row ⇒ all on. */
export interface ReminderPrefs {
  readyAgain: boolean;
  endsToday: boolean;
  endsSoon: boolean;
}

export const ALL_REMINDERS_ON: ReminderPrefs = {
  readyAgain: true,
  endsToday: true,
  endsSoon: true,
};

export interface PlannedReminder {
  type: SeekerReminderType;
  listing: ReminderListing;
  /**
   * Stable idempotency key scoped to the reminder's window: the re-open date for
   * ready-again, the end date for ending reminders. Combined with type + listing
   * id it dedupes a reminder to exactly one send per window.
   */
  reminderKey: string;
  /** Whole days until the listing ends (negative once past). */
  endsInDays: number;
}

// Lower rank = more urgent. Drives digest ordering and one-per-listing pick.
const URGENCY_RANK: Record<SeekerReminderType, number> = {
  ends_today: 0,
  ending_soon: 1,
  ready_again: 2,
};

function isoDay(value: Date | string): string {
  return new Date(value).toISOString().slice(0, 10);
}

function dateInTimeZone(now: Date, timeZone?: string): string | null {
  if (!timeZone) return null;
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(now);
    const values = Object.fromEntries(
      parts.map((part) => [part.type, part.value]),
    );
    return `${values.year}-${values.month}-${values.day}`;
  } catch {
    return null;
  }
}

/**
 * Compute the single most relevant reminder for one tracked listing, or null.
 *
 * Rules, honest by construction:
 * - Won or skipped listings are never nudged.
 * - Ready-again fires once per re-open window (keyed on the re-open date), so an
 *   ignored nudge is not re-sent daily — a new window only opens after the user
 *   actually re-enters. No manufactured urgency, no nagging.
 * - Ending reminders require the seeker to be tracking the listing (saved or
 *   entered) and fire once per end date.
 * - At most one reminder per listing; the most urgent framing wins.
 */
export function planReminderForListing(
  candidate: ReminderCandidate,
  prefs: ReminderPrefs = ALL_REMINDERS_ON,
  now: Date = new Date(),
  calendarTimeZone?: string,
): PlannedReminder | null {
  const { listing, activity } = candidate;

  // Never nudge a resolved listing.
  if (activity.wonAt || activity.skippedAt) return null;

  // Public discovery keeps a date-only listing visible through the last
  // plausible civil timezone. Reminder claims intentionally use a strict
  // calendar, however: after the selected calendar has advanced, yesterday's
  // listing must not poison an otherwise-current atomic digest.
  const calendarToday = dateInTimeZone(now, calendarTimeZone);
  if (calendarToday && listing.endDate.slice(0, 10) < calendarToday) return null;

  const endsInDays = daysUntil(listing.endDate, now);
  const expiry = listingExpiration(listing.endDate, now, calendarTimeZone);
  const expired = expiry.state === "expired";
  if (expired) return null;

  const tracked = Boolean(activity.savedAt) || Boolean(activity.enteredAt);
  const options: PlannedReminder[] = [];

  // Ready again — the entry window re-opened for a recurring sweep.
  if (prefs.readyAgain && activity.enteredAt) {
    const reopen = nextEntryAt(activity.enteredAt, listing.entryFrequency);
    if (reopen && reopen.getTime() <= now.getTime()) {
      options.push({
        type: "ready_again",
        listing,
        reminderKey: isoDay(reopen),
        endsInDays,
      });
    }
  }

  // Ending reminders — only for sweeps the seeker is actually tracking.
  if (tracked) {
    if (prefs.endsToday && expiry.state === "ends_today") {
      options.push({
        type: "ends_today",
        listing,
        reminderKey: isoDay(listing.endDate),
        endsInDays,
      });
    } else if (prefs.endsSoon && expiry.state === "ending_soon") {
      options.push({
        type: "ending_soon",
        listing,
        reminderKey: isoDay(listing.endDate),
        endsInDays,
      });
    }
  }

  if (options.length === 0) return null;
  options.sort((a, b) => URGENCY_RANK[a.type] - URGENCY_RANK[b.type]);
  return options[0];
}

/**
 * Plan a user's full reminder set, most urgent first, then soonest to end.
 * One reminder per listing. Callers dedupe against notification_log before send.
 */
export function planSeekerReminders(
  candidates: ReminderCandidate[],
  prefs: ReminderPrefs = ALL_REMINDERS_ON,
  now: Date = new Date(),
  calendarTimeZone?: string,
): PlannedReminder[] {
  const planned: PlannedReminder[] = [];
  for (const candidate of candidates) {
    const reminder = planReminderForListing(candidate, prefs, now, calendarTimeZone);
    if (reminder) planned.push(reminder);
  }

  return planned.sort((a, b) => {
    const rank = URGENCY_RANK[a.type] - URGENCY_RANK[b.type];
    if (rank !== 0) return rank;
    return a.endsInDays - b.endsInDays;
  });
}

/** Idempotency key for a planned reminder — matches the notification_log row. */
export function reminderLogKey(reminder: {
  type: SeekerReminderType;
  listing: { id: string };
  reminderKey: string;
}): string {
  return `${reminder.type}|${reminder.listing.id}|${reminder.reminderKey}`;
}
