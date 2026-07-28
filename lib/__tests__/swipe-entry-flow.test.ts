import { describe, expect, it } from "vitest";
import {
  IDLE_SWIPE_ENTRY_FLOW,
  primaryStateAfterSwipe,
  transitionSwipeEntryFlow,
} from "@/lib/swipe-entry-flow";

const LISTING_ID = "listing-1";

describe("swipe entry confirmation flow", () => {
  it("preserves entry and win precedence while saving independently", () => {
    expect(primaryStateAfterSwipe("won", "skip")).toBe("won");
    expect(primaryStateAfterSwipe("won", "enter")).toBe("won");
    expect(primaryStateAfterSwipe("won", "save")).toBe("won");
    expect(primaryStateAfterSwipe("entered", "skip")).toBe("entered");
    expect(primaryStateAfterSwipe("entered", "save")).toBe("entered");
    expect(primaryStateAfterSwipe("skipped", "enter")).toBe("entered");
    expect(primaryStateAfterSwipe("saved", "skip")).toBe("skipped");
  });

  it("does not confirm an entry when the official source is only opened", () => {
    const transition = transitionSwipeEntryFlow(IDLE_SWIPE_ENTRY_FLOW, {
      type: "official_source_opened",
      listingId: LISTING_ID,
    });

    expect(transition).toEqual({
      state: {
        status: "awaiting_confirmation",
        listingId: LISTING_ID,
      },
    });
    expect(transition.confirmedListingId).toBeUndefined();
  });

  it("emits persistence only after explicit confirmation for the same listing", () => {
    const awaiting = transitionSwipeEntryFlow(IDLE_SWIPE_ENTRY_FLOW, {
      type: "official_source_opened",
      listingId: LISTING_ID,
    }).state;

    expect(
      transitionSwipeEntryFlow(awaiting, {
        type: "confirm",
        listingId: "another-listing",
      }).confirmedListingId,
    ).toBeUndefined();

    expect(
      transitionSwipeEntryFlow(awaiting, {
        type: "confirm",
        listingId: LISTING_ID,
      }),
    ).toEqual({
      state: IDLE_SWIPE_ENTRY_FLOW,
      confirmedListingId: LISTING_ID,
    });
  });

  it("keeps failed and cancelled opens non-persistent", () => {
    const failed = transitionSwipeEntryFlow(IDLE_SWIPE_ENTRY_FLOW, {
      type: "official_source_failed",
      listingId: LISTING_ID,
    });
    expect(failed.state).toEqual({
      status: "open_failed",
      listingId: LISTING_ID,
    });
    expect(failed.confirmedListingId).toBeUndefined();

    const awaiting = transitionSwipeEntryFlow(IDLE_SWIPE_ENTRY_FLOW, {
      type: "official_source_opened",
      listingId: LISTING_ID,
    }).state;
    expect(
      transitionSwipeEntryFlow(awaiting, { type: "cancel" }),
    ).toEqual({ state: IDLE_SWIPE_ENTRY_FLOW });
  });
});
