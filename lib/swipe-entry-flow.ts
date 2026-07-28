import type { SeekerUiState } from "@/lib/types/listing";

export type SwipeEntryFlow =
  | { status: "idle" }
  | { status: "awaiting_confirmation"; listingId: string }
  | { status: "open_failed"; listingId: string };

export type SwipeEntryEvent =
  | { type: "official_source_opened"; listingId: string }
  | { type: "official_source_failed"; listingId: string }
  | { type: "confirm"; listingId: string }
  | { type: "cancel" };

export interface SwipeEntryTransition {
  state: SwipeEntryFlow;
  confirmedListingId?: string;
}

export const IDLE_SWIPE_ENTRY_FLOW: SwipeEntryFlow = { status: "idle" };

export type SwipePrimaryAction = "skip" | "save" | "enter";

/**
 * Resolves the primary state without allowing a deck gesture to downgrade
 * recorded outcomes. Saving is an independent flag; a skip cannot erase an
 * entry or win; and even another confirmed entry cannot replace a win.
 */
export function primaryStateAfterSwipe(
  current: SeekerUiState,
  action: SwipePrimaryAction,
): SeekerUiState {
  if (action === "save") return current;
  if (current === "won") return current;
  if (action === "skip" && current === "entered") return current;
  return action === "enter" ? "entered" : "skipped";
}

/**
 * Models the trust boundary between opening a sponsor page and recording an
 * entry. Opening the page can only request confirmation; the persistence
 * signal is emitted exclusively by an explicit confirmation for that listing.
 */
export function transitionSwipeEntryFlow(
  current: SwipeEntryFlow,
  event: SwipeEntryEvent,
): SwipeEntryTransition {
  switch (event.type) {
    case "official_source_opened":
      return {
        state: {
          status: "awaiting_confirmation",
          listingId: event.listingId,
        },
      };
    case "official_source_failed":
      return {
        state: {
          status: "open_failed",
          listingId: event.listingId,
        },
      };
    case "confirm":
      if (
        current.status !== "awaiting_confirmation" ||
        current.listingId !== event.listingId
      ) {
        return { state: current };
      }
      return {
        state: IDLE_SWIPE_ENTRY_FLOW,
        confirmedListingId: event.listingId,
      };
    case "cancel":
      return { state: IDLE_SWIPE_ENTRY_FLOW };
  }
}
