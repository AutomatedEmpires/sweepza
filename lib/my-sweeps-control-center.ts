import { isExpired } from "@/lib/listing-badges";
import type { RoutineSnapshot } from "@/lib/sweep-routine";
import type {
  Listing,
  SeekerListingActivity,
  SeekerUiState,
} from "@/lib/types/listing";

export type MySweepsSort = "deadline" | "recent" | "value";
export type MySweepsHistoryState = Exclude<SeekerUiState, "none">;

export interface MySweepsHistoryItem {
  listing: Listing;
  state: MySweepsHistoryState;
  stateLabel: string;
  activityAt: string | null;
}

const HISTORY_STATE_LABEL: Record<MySweepsHistoryState, string> = {
  saved: "Saved",
  entered: "Entered · marked by you",
  skipped: "Skipped",
  won: "Won · reported by you",
};

function validTimestamp(value: string | undefined): number {
  if (!value) return 0;
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function latestActivityAt(
  activity: SeekerListingActivity | undefined,
): string | null {
  if (!activity) return null;

  const timestamps = [
    activity.updatedAt,
    activity.wonAt,
    activity.enteredAt,
    activity.skippedAt,
    activity.savedAt,
  ].filter((value): value is string => Boolean(value));

  return (
    timestamps.sort(
      (a, b) => validTimestamp(b) - validTimestamp(a),
    )[0] ?? null
  );
}

function currentHistoryState(
  listingId: string,
  snapshot: RoutineSnapshot,
): MySweepsHistoryState | null {
  const primary = snapshot.primary[listingId] ?? "none";
  if (primary !== "none") return primary;
  return snapshot.saved[listingId] ? "saved" : null;
}

/**
 * Builds the current control-center history without duplicating the canonical
 * listing model. Old activity timestamps alone do not make a listing current:
 * clearing its state removes it unless it is still saved.
 */
export function buildMySweepsHistory(
  listings: Listing[],
  snapshot: RoutineSnapshot,
): MySweepsHistoryItem[] {
  const items: MySweepsHistoryItem[] = [];

  for (const listing of listings) {
    const state = currentHistoryState(listing.id, snapshot);
    if (!state) continue;

    items.push({
      listing,
      state,
      stateLabel: HISTORY_STATE_LABEL[state],
      activityAt: latestActivityAt(snapshot.activity[listing.id]),
    });
  }

  return items;
}

function sponsorName(listing: Listing): string {
  return [listing.originalSponsorName, listing.host?.name]
    .filter(Boolean)
    .join(" ");
}

function matchesQuery(listing: Listing, query: string): boolean {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) return true;

  return [listing.title, listing.prizeName, sponsorName(listing)].some((value) =>
    value.toLocaleLowerCase().includes(normalizedQuery),
  );
}

function endTimestamp(listing: Listing): number {
  const timestamp = new Date(listing.endDate).getTime();
  return Number.isNaN(timestamp) ? Number.POSITIVE_INFINITY : timestamp;
}

function compareDeadline(a: Listing, b: Listing, now: Date): number {
  const aExpired = isExpired(a, now);
  const bExpired = isExpired(b, now);
  if (aExpired !== bExpired) return aExpired ? 1 : -1;

  const aEnd = endTimestamp(a);
  const bEnd = endTimestamp(b);
  const deadlineOrder = aExpired ? bEnd - aEnd : aEnd - bEnd;
  return deadlineOrder || a.title.localeCompare(b.title);
}

function activityTimestamp(
  listing: Listing,
  snapshot: RoutineSnapshot,
): number {
  return validTimestamp(latestActivityAt(snapshot.activity[listing.id]) ?? undefined);
}

/**
 * Shared search and sort behavior for every My Sweeps view. Sorting a copy
 * preserves the canonical bucket arrays and caller-owned listing data.
 */
export function filterAndSortMySweepsListings(
  listings: Listing[],
  snapshot: RoutineSnapshot,
  query: string,
  sort: MySweepsSort,
  now: Date = new Date(),
): Listing[] {
  const filtered = listings.filter((listing) => matchesQuery(listing, query));

  return filtered.sort((a, b) => {
    if (sort === "recent") {
      return (
        activityTimestamp(b, snapshot) -
          activityTimestamp(a, snapshot) ||
        compareDeadline(a, b, now)
      );
    }

    if (sort === "value") {
      return (
        (b.prizeValue ?? Number.NEGATIVE_INFINITY) -
          (a.prizeValue ?? Number.NEGATIVE_INFINITY) ||
        compareDeadline(a, b, now)
      );
    }

    return compareDeadline(a, b, now);
  });
}
