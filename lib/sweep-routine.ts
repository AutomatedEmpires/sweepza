import { daysUntil, isExpired } from "@/lib/listing-badges";
import type {
  EntryFrequency,
  Listing,
  SeekerListingActivity,
  SeekerUiState,
} from "@/lib/types/listing";

// Sweep Routine — the shared state math behind Today, Ready Again, and
// My Sweeps. Source of truth: "Sweepza — Consumer Operating Layer".
//
// Pure and isomorphic: runs server-side from a DB snapshot and client-side
// from the seeker-state provider, so signed-out (local) seekers get the same
// routine mechanics as signed-in ones.

const DAY_MS = 24 * 60 * 60 * 1000;
const ENDING_SOON_DAYS = 3;

/** Snapshot shape shared by the DB layer and the client provider. */
export interface RoutineSnapshot {
  primary: Record<string, SeekerUiState>;
  saved: Record<string, boolean>;
  activity: Record<string, SeekerListingActivity>;
}

export const EMPTY_ROUTINE_SNAPSHOT: RoutineSnapshot = {
  primary: {},
  saved: {},
  activity: {},
};

/**
 * When a listing can be entered again after `enteredAt`, per its canonical
 * entry frequency. Daily (and daily-style instant win) resets at the start of
 * the next local day — the "come back tomorrow" loop. Weekly/monthly use
 * rolling windows. One-time and unknown cadences never re-open.
 */
export function nextEntryAt(
  enteredAt: string,
  frequency: EntryFrequency,
): Date | null {
  const entered = new Date(enteredAt);
  if (Number.isNaN(entered.getTime())) return null;

  switch (frequency) {
    case "daily":
    case "instant_win": {
      const next = new Date(entered);
      next.setHours(24, 0, 0, 0);
      return next;
    }
    case "weekly":
      return new Date(entered.getTime() + 7 * DAY_MS);
    case "monthly":
      return new Date(entered.getTime() + 30 * DAY_MS);
    default:
      return null;
  }
}

export function isReadyAgain(
  listing: Listing,
  activity: SeekerListingActivity | undefined,
  now: Date = new Date(),
): boolean {
  if (!activity?.enteredAt) return false;
  if (isExpired(listing, now)) return false;

  const next = nextEntryAt(activity.enteredAt, listing.entryFrequency);
  return next !== null && next.getTime() <= now.getTime();
}

export type RoutineBucketId =
  | "ready"
  | "readyAgain"
  | "endingSoon"
  | "saved"
  | "entered"
  | "won"
  | "skipped";

export interface RoutineBuckets {
  /** Saved, active, not yet entered — actionable right now. */
  ready: Listing[];
  /** Entered before and the entry window has re-opened. */
  readyAgain: Listing[];
  /** Saved or entered, ending within the next few days. */
  endingSoon: Listing[];
  saved: Listing[];
  entered: Listing[];
  won: Listing[];
  skipped: Listing[];
}

function byEndDateAsc(a: Listing, b: Listing): number {
  return new Date(a.endDate).getTime() - new Date(b.endDate).getTime();
}

function byActivityDesc(
  activity: Record<string, SeekerListingActivity>,
  key: keyof SeekerListingActivity,
) {
  return (a: Listing, b: Listing): number => {
    const at = activity[a.id]?.[key];
    const bt = activity[b.id]?.[key];
    return (bt ? new Date(bt).getTime() : 0) - (at ? new Date(at).getTime() : 0);
  };
}

/**
 * Buckets a listing set against a seeker snapshot. Listings the seeker has
 * never touched are ignored — discovery surfaces own those.
 */
export function buildRoutineBuckets(
  listings: Listing[],
  snapshot: RoutineSnapshot,
  now: Date = new Date(),
): RoutineBuckets {
  const buckets: RoutineBuckets = {
    ready: [],
    readyAgain: [],
    endingSoon: [],
    saved: [],
    entered: [],
    won: [],
    skipped: [],
  };

  for (const listing of listings) {
    const primary = snapshot.primary[listing.id] ?? "none";
    const activity = snapshot.activity[listing.id];
    const saved = Boolean(snapshot.saved[listing.id]);
    const entered = primary === "entered" || Boolean(activity?.enteredAt);
    const won = primary === "won";
    const skipped = primary === "skipped";
    const expired = isExpired(listing, now);

    if (skipped) {
      buckets.skipped.push(listing);
      continue;
    }

    if (saved) buckets.saved.push(listing);
    if (entered) buckets.entered.push(listing);
    if (won) buckets.won.push(listing);

    if (won) continue;

    if (saved && !entered && !expired) buckets.ready.push(listing);
    if (isReadyAgain(listing, activity, now)) buckets.readyAgain.push(listing);
    if (
      (saved || entered) &&
      !expired &&
      daysUntil(listing.endDate, now) <= ENDING_SOON_DAYS
    ) {
      buckets.endingSoon.push(listing);
    }
  }

  buckets.ready.sort(byEndDateAsc);
  buckets.readyAgain.sort(byEndDateAsc);
  buckets.endingSoon.sort(byEndDateAsc);
  buckets.saved.sort(byActivityDesc(snapshot.activity, "savedAt"));
  buckets.entered.sort(byActivityDesc(snapshot.activity, "enteredAt"));
  buckets.won.sort(byActivityDesc(snapshot.activity, "wonAt"));
  buckets.skipped.sort(byActivityDesc(snapshot.activity, "skippedAt"));

  return buckets;
}

export interface RecentActivityItem {
  listing: Listing;
  state: SeekerUiState;
  at: string;
}

/** Most recent seeker actions across the snapshot, newest first. */
export function buildRecentActivity(
  listings: Listing[],
  snapshot: RoutineSnapshot,
  limit = 6,
): RecentActivityItem[] {
  const byId = new Map(listings.map((l) => [l.id, l]));
  const items: RecentActivityItem[] = [];

  for (const [listingId, activity] of Object.entries(snapshot.activity)) {
    const listing = byId.get(listingId);
    if (!listing) continue;

    const candidates: Array<[SeekerUiState, string | undefined]> = [
      ["won", activity.wonAt],
      ["entered", activity.enteredAt],
      ["saved", activity.savedAt],
      ["skipped", activity.skippedAt],
    ];
    for (const [state, at] of candidates) {
      if (at) {
        items.push({ listing, state, at });
        break;
      }
    }
  }

  return items
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, limit);
}
