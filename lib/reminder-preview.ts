import { listingExpiration } from "@/lib/listing-badges";
import {
  planReminderForListing,
  planSeekerReminders,
  reminderLogKey,
  type ReminderCandidate,
  type ReminderPrefs,
  ALL_REMINDERS_ON,
  MAX_ITEMS_PER_REMINDER_DIGEST,
} from "@/lib/seeker-reminders";
import { nextEntryAt } from "@/lib/sweep-routine";
import { seekerReminderDigestEmail, type SeekerReminderItem } from "@/lib/email/templates";

// Reminder dry-run / preview — show exactly which nudges WOULD go out and, just
// as importantly, which would NOT and why. The scheduled route still requires
// a configured Resend key, so this is how the logic is inspected without a
// transport: feed it sample seekers and see the rendered digest plus a
// per-listing verdict.
//
// Pure: no database, no Resend, no send. It renders the same digest template the
// cron would, so what you preview is what a seeker would receive.

export type SuppressionReason =
  | "won"
  | "skipped"
  | "expired"
  | "not_tracked"
  | "window_not_open"
  | "not_in_window"
  | "pref_off"
  | "already_sent"
  | "email_disabled"
  | "missing_email"
  | "digest_cap";

export interface PreviewListingVerdict {
  listingId: string;
  title: string;
  included: boolean;
  reminderType?: "ready_again" | "ends_today" | "ending_soon";
  suppression?: SuppressionReason;
  detail: string;
}

export interface SeekerReminderPreview {
  userLabel: string;
  /** The rendered digest, or null when the seeker would receive nothing. */
  digest: {
    subject: string;
    itemCount: number;
    items: SeekerReminderItem[];
    todayUrl: string;
  } | null;
  verdicts: PreviewListingVerdict[];
}

export interface PreviewInput {
  userLabel: string;
  candidates: ReminderCandidate[];
  prefs?: ReminderPrefs;
  /** Mirrors notification_pref.email_enabled; missing pref rows default on. */
  emailEnabled?: boolean;
  /** Whether the user bucket has a deliverable address; defaults true for fixtures. */
  hasEmailAddress?: boolean;
  /** Log keys already sent (idempotency), matching reminderLogKey output. */
  alreadySent?: Set<string>;
}

export interface PreviewOptions {
  baseUrl?: string;
  displayName?: string;
  now?: Date;
  /** Required to classify calendar-only dates as "ends today" honestly. */
  calendarTimeZone?: string;
}

/** Explain why a single tracked listing is or isn't getting a reminder. */
function verdictFor(
  candidate: ReminderCandidate,
  prefs: ReminderPrefs,
  alreadySent: Set<string>,
  now: Date,
  calendarTimeZone?: string,
): PreviewListingVerdict {
  const { listing, activity } = candidate;
  const base = { listingId: listing.id, title: listing.title };

  if (activity.wonAt) return { ...base, included: false, suppression: "won", detail: "seeker already won — never nudged" };
  if (activity.skippedAt) return { ...base, included: false, suppression: "skipped", detail: "seeker skipped this sweep — never nudged" };
  const expiry = listingExpiration(listing.endDate, now, calendarTimeZone);
  if (expiry.state === "expired") {
    return { ...base, included: false, suppression: "expired", detail: "sweep has ended — no reminder" };
  }

  const plannedWithAllPrefs = planReminderForListing(
    candidate,
    ALL_REMINDERS_ON,
    now,
    calendarTimeZone,
  );
  const planned = planReminderForListing(candidate, prefs, now, calendarTimeZone);
  if (!planned) {
    if (plannedWithAllPrefs) {
      return {
        ...base,
        included: false,
        reminderType: plannedWithAllPrefs.type,
        suppression: "pref_off",
        detail: `${plannedWithAllPrefs.type.replace("_", " ")} preference is off`,
      };
    }
    // Distinguish the common no-reminder reasons for a useful preview.
    const tracked = Boolean(activity.savedAt) || Boolean(activity.enteredAt);
    if (!tracked) {
      return { ...base, included: false, suppression: "not_tracked", detail: "not saved or entered — ending reminders need tracking" };
    }
    if (activity.enteredAt) {
      const reopen = nextEntryAt(activity.enteredAt, listing.entryFrequency);
      if (reopen && reopen.getTime() > now.getTime()) {
        return { ...base, included: false, suppression: "window_not_open", detail: "re-entry window has not re-opened yet" };
      }
    }
    return { ...base, included: false, suppression: "not_in_window", detail: "outside the ending-soon window and no re-entry due" };
  }

  // Would plan a reminder — but is the pref on and has it already been sent?
  const key = reminderLogKey(planned);
  if (alreadySent.has(key)) {
    return {
      ...base,
      included: false,
      reminderType: planned.type,
      suppression: "already_sent",
      detail: "already sent for this window — deduped",
    };
  }

  return {
    ...base,
    included: true,
    reminderType: planned.type,
    detail: `would send a ${planned.type.replace("_", " ")} reminder`,
  };
}

/**
 * Build a single seeker's reminder preview: the rendered digest (if any) plus a
 * verdict for every candidate. Mirrors the cron's planner + dedupe + template,
 * with the send replaced by a report.
 */
export function previewSeekerReminders(
  input: PreviewInput,
  options: PreviewOptions = {},
): SeekerReminderPreview {
  const now = options.now ?? new Date();
  const baseUrl = (options.baseUrl ?? "https://sweepza.com").replace(/\/$/, "");
  const prefs = input.prefs ?? ALL_REMINDERS_ON;
  const alreadySent = input.alreadySent ?? new Set<string>();

  const verdicts = input.candidates.map((c) =>
    verdictFor(c, prefs, alreadySent, now, options.calendarTimeZone),
  );

  const suppressIncluded = (suppression: SuppressionReason, detail: string) => {
    for (const verdict of verdicts) {
      if (verdict.included) {
        verdict.included = false;
        verdict.suppression = suppression;
        verdict.detail = detail;
      }
    }
  };

  if (input.emailEnabled === false) {
    suppressIncluded("email_disabled", "email delivery is disabled for this seeker");
  } else if (input.hasEmailAddress === false) {
    suppressIncluded("missing_email", "the seeker has no email address");
  }

  const plannedInProductionOrder = planSeekerReminders(
    input.candidates,
    prefs,
    now,
    options.calendarTimeZone,
  ).filter((planned) => {
    const verdict = verdicts.find((item) => item.listingId === planned.listing.id);
    return verdict?.included === true;
  });

  const toInclude = plannedInProductionOrder.slice(0, MAX_ITEMS_PER_REMINDER_DIGEST);
  const includedIds = new Set(toInclude.map((planned) => planned.listing.id));
  for (const verdict of verdicts) {
    if (verdict.included && !includedIds.has(verdict.listingId)) {
      verdict.included = false;
      verdict.suppression = "digest_cap";
      verdict.detail = `outside the ${MAX_ITEMS_PER_REMINDER_DIGEST}-item digest cap`;
    }
  }

  const included = verdicts.filter((v) => v.included);
  if (included.length === 0) {
    return { userLabel: input.userLabel, digest: null, verdicts };
  }

  const items: SeekerReminderItem[] = toInclude.map((planned) => ({
    kind: planned.type,
    title: planned.listing.title,
    listingUrl: `${baseUrl}/sweeps/${planned.listing.slug}`,
    endsInDays: planned.endsInDays,
  }));

  const email = seekerReminderDigestEmail({
    displayName: options.displayName ?? input.userLabel,
    todayUrl: `${baseUrl}/`,
    items,
  });

  return {
    userLabel: input.userLabel,
    digest: {
      subject: email.subject,
      itemCount: items.length,
      items,
      todayUrl: `${baseUrl}/`,
    },
    verdicts,
  };
}

export interface ReminderPreviewSummary {
  users: SeekerReminderPreview[];
  totals: {
    users: number;
    usersEmailed: number;
    reminders: number;
    suppressed: number;
  };
}

/** Preview a batch of seekers at once, with aggregate would-send totals. */
export function previewReminderBatch(
  inputs: PreviewInput[],
  options: PreviewOptions = {},
): ReminderPreviewSummary {
  const users = inputs.map((input) => previewSeekerReminders(input, options));
  return {
    users,
    totals: {
      users: users.length,
      usersEmailed: users.filter((u) => u.digest !== null).length,
      reminders: users.reduce((n, u) => n + (u.digest?.itemCount ?? 0), 0),
      suppressed: users.reduce(
        (n, u) => n + u.verdicts.filter((v) => !v.included).length,
        0,
      ),
    },
  };
}
