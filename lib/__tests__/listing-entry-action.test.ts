import { describe, expect, it } from "vitest";
import { getListingEntryAction } from "@/lib/listing-entry-action";
import type { Listing } from "@/lib/types/listing";

const NOW = new Date("2026-07-29T12:00:00.000Z");

function listing(overrides: Partial<Listing> = {}): Listing {
  return {
    id: "listing-1",
    slug: "test-sweep",
    title: "Test Sweep",
    shortDescription: "Test description",
    prizeName: "Test prize",
    entryUrl: "https://example.com/enter",
    startDate: "2026-07-01",
    endDate: "2026-08-30",
    entryFrequency: "one_time",
    sourceLabel: "found_by_sweepza",
    lifecycleStatus: "active",
    listingVerificationStatus: "reviewed",
    ...overrides,
  };
}

describe("listing entry action", () => {
  it("opens with the exact primary label requested by the product", () => {
    expect(
      getListingEntryAction({
        listing: listing(),
        uiState: "none",
        now: NOW,
      }),
    ).toMatchObject({
      state: "open",
      label: "ENTER NOW",
      canOpen: true,
    });
  });

  it("records one-time entries without offering an invented re-entry", () => {
    expect(
      getListingEntryAction({
        listing: listing({ entryFrequency: "one_time" }),
        uiState: "entered",
        enteredAt: "2026-07-28T10:00:00",
        now: NOW,
      }),
    ).toMatchObject({
      state: "recorded",
      label: "ENTRY RECORDED",
      canOpen: false,
    });
  });

  it("counts down recurring entries and re-opens only after their cadence", () => {
    const daily = listing({ entryFrequency: "daily" });

    expect(
      getListingEntryAction({
        listing: daily,
        uiState: "entered",
        enteredAt: "2026-07-29T08:00:00.000Z",
        now: NOW,
      }),
    ).toMatchObject({
      state: "waiting",
      label: "ENTRY RECORDED",
      canOpen: false,
    });

    expect(
      getListingEntryAction({
        listing: daily,
        uiState: "entered",
        enteredAt: "2026-07-28T08:00:00.000Z",
        now: NOW,
      }),
    ).toMatchObject({
      state: "again",
      label: "ENTER AGAIN",
      canOpen: true,
    });
  });

  it("disables entry before opening and for non-active or ended listings", () => {
    expect(
      getListingEntryAction({
        listing: listing({ startDate: "2026-08-01" }),
        uiState: "none",
        now: NOW,
      }),
    ).toMatchObject({
      state: "upcoming",
      label: "OPENS Aug 1, 2026",
      canOpen: false,
    });

    expect(
      getListingEntryAction({
        listing: listing({ lifecycleStatus: "paused" }),
        uiState: "none",
        now: NOW,
      }),
    ).toMatchObject({
      state: "unavailable",
      label: "ENTRY UNAVAILABLE",
      canOpen: false,
    });

    expect(
      getListingEntryAction({
        listing: listing({ endDate: "2026-07-20" }),
        uiState: "none",
        now: NOW,
      }),
    ).toMatchObject({
      state: "expired",
      label: "SWEEPSTAKES ENDED",
      canOpen: false,
    });
  });

  it("uses the same UTC calendar boundary during SSR and hydration", () => {
    const startsJuly30 = listing({ startDate: "2026-07-30" });

    expect(
      getListingEntryAction({
        listing: startsJuly30,
        uiState: "none",
        now: new Date("2026-07-29T23:59:59.999Z"),
      }),
    ).toMatchObject({ state: "upcoming", canOpen: false });

    expect(
      getListingEntryAction({
        listing: startsJuly30,
        uiState: "none",
        now: new Date("2026-07-30T00:00:00.000Z"),
      }),
    ).toMatchObject({ state: "open", canOpen: true });
  });

  it("moves from upcoming to open to expired as the shared clock advances", () => {
    const oneDay = listing({
      startDate: "2026-07-30",
      endDate: "2026-07-30",
    });

    expect(
      getListingEntryAction({
        listing: oneDay,
        uiState: "none",
        now: new Date("2026-07-29T23:59:00.000Z"),
      }).state,
    ).toBe("upcoming");
    expect(
      getListingEntryAction({
        listing: oneDay,
        uiState: "none",
        now: new Date("2026-07-30T12:00:00.000Z"),
      }).state,
    ).toBe("open");
    expect(
      getListingEntryAction({
        listing: oneDay,
        uiState: "none",
        now: new Date("2026-07-31T12:01:00.000Z"),
      }).state,
    ).toBe("expired");
  });

  it("keeps a recorded win terminal", () => {
    expect(
      getListingEntryAction({
        listing: listing({ lifecycleStatus: "archived" }),
        uiState: "won",
        now: NOW,
      }),
    ).toMatchObject({
      state: "won",
      label: "YOU WON THIS",
      canOpen: false,
    });
  });
});
