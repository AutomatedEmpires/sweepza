import { isExpired } from "@/lib/listing-badges";
import { formatEndDate } from "@/lib/listing-format";
import { nextEntryAt } from "@/lib/sweep-routine";
import type { Listing, SeekerUiState } from "@/lib/types/listing";

export type ListingEntryActionState =
  | "open"
  | "again"
  | "waiting"
  | "recorded"
  | "upcoming"
  | "unavailable"
  | "expired"
  | "won";

export interface ListingEntryAction {
  state: ListingEntryActionState;
  label: string;
  canOpen: boolean;
  nextEntryAt: Date | null;
}

function utcDateKey(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function startsInFuture(listing: Listing, now: Date): boolean {
  const startDate = listing.startDate?.slice(0, 10);
  // Canonical start dates are calendar facts. UTC keeps server rendering and
  // hydration deterministic for every viewer near a local-midnight boundary.
  return Boolean(startDate && startDate > utcDateKey(now));
}

/**
 * One entry-action contract for every listing surface.
 *
 * Opening the sponsor page never records an entry. The caller must still ask
 * the seeker to confirm completion before persisting `entered`.
 */
export function getListingEntryAction({
  listing,
  uiState,
  enteredAt,
  now = new Date(),
  reopened = false,
}: {
  listing: Listing;
  uiState: SeekerUiState;
  enteredAt?: string;
  now?: Date;
  reopened?: boolean;
}): ListingEntryAction {
  if (uiState === "won") {
    return {
      state: "won",
      label: "YOU WON THIS",
      canOpen: false,
      nextEntryAt: null,
    };
  }

  if (isExpired(listing, now)) {
    return {
      state: "expired",
      label: "SWEEPSTAKES ENDED",
      canOpen: false,
      nextEntryAt: null,
    };
  }

  if (listing.lifecycleStatus !== "active") {
    return {
      state: "unavailable",
      label: "ENTRY UNAVAILABLE",
      canOpen: false,
      nextEntryAt: null,
    };
  }

  if (startsInFuture(listing, now)) {
    return {
      state: "upcoming",
      label: `OPENS ${formatEndDate(listing.startDate!)}`,
      canOpen: false,
      nextEntryAt: null,
    };
  }

  if (uiState !== "entered") {
    return {
      state: "open",
      label: "ENTER NOW",
      canOpen: true,
      nextEntryAt: null,
    };
  }

  const next = enteredAt
    ? nextEntryAt(enteredAt, listing.entryFrequency)
    : null;
  const readyAgain = Boolean(
    next && (reopened || next.getTime() <= now.getTime()),
  );

  if (readyAgain) {
    return {
      state: "again",
      label: "ENTER AGAIN",
      canOpen: true,
      nextEntryAt: next,
    };
  }

  if (next) {
    return {
      state: "waiting",
      label: "ENTRY RECORDED",
      canOpen: false,
      nextEntryAt: next,
    };
  }

  return {
    state: "recorded",
    label: "ENTRY RECORDED",
    canOpen: false,
    nextEntryAt: null,
  };
}
