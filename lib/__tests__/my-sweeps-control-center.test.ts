import { describe, expect, it } from "vitest";
import {
  buildMySweepsHistory,
  filterAndSortMySweepsListings,
  type MySweepsSort,
} from "@/lib/my-sweeps-control-center";
import {
  EMPTY_ROUTINE_SNAPSHOT,
  type RoutineSnapshot,
} from "@/lib/sweep-routine";
import type { Listing } from "@/lib/types/listing";

const NOW = new Date("2026-07-10T12:00:00.000Z");

function listing(overrides: Partial<Listing> = {}): Listing {
  return {
    id: "listing-1",
    slug: "summer-prize",
    title: "Summer Prize",
    shortDescription: "Official sweepstakes listing",
    prizeName: "Gift card",
    prizeValue: 500,
    entryUrl: "https://example.com/enter",
    endDate: "2026-07-20",
    entryFrequency: "one_time",
    sourceLabel: "found_by_sweepza",
    lifecycleStatus: "active",
    listingVerificationStatus: "reviewed",
    ...overrides,
  };
}

function snapshot(partial: Partial<RoutineSnapshot>): RoutineSnapshot {
  return {
    ...EMPTY_ROUTINE_SNAPSHOT,
    ...partial,
  };
}

describe("buildMySweepsHistory", () => {
  it("includes every current non-none state and excludes cleared or untouched listings", () => {
    const listings = [
      listing({ id: "saved" }),
      listing({ id: "entered" }),
      listing({ id: "skipped" }),
      listing({ id: "won" }),
      listing({ id: "cleared" }),
      listing({ id: "untouched" }),
    ];
    const items = buildMySweepsHistory(
      listings,
      snapshot({
        primary: {
          saved: "none",
          entered: "entered",
          skipped: "skipped",
          won: "won",
          cleared: "none",
        },
        saved: { saved: true },
        activity: {
          saved: { savedAt: "2026-07-01T12:00:00.000Z" },
          entered: { enteredAt: "2026-07-02T12:00:00.000Z" },
          skipped: { skippedAt: "2026-07-03T12:00:00.000Z" },
          won: { wonAt: "2026-07-04T12:00:00.000Z" },
          cleared: {
            enteredAt: "2026-06-01T12:00:00.000Z",
            updatedAt: "2026-07-05T12:00:00.000Z",
          },
        },
      }),
    );

    expect(items.map((item) => item.listing.id)).toEqual([
      "saved",
      "entered",
      "skipped",
      "won",
    ]);
    expect(items.map((item) => [item.state, item.stateLabel])).toEqual([
      ["saved", "Saved"],
      ["entered", "Entered · marked by you"],
      ["skipped", "Skipped"],
      ["won", "Won · reported by you"],
    ]);
  });

  it("uses the latest valid activity timestamp for recent sorting", () => {
    const [item] = buildMySweepsHistory(
      [listing()],
      snapshot({
        primary: { "listing-1": "entered" },
        activity: {
          "listing-1": {
            savedAt: "2026-07-04T12:00:00.000Z",
            enteredAt: "2026-07-05T12:00:00.000Z",
            updatedAt: "2026-07-06T12:00:00.000Z",
          },
        },
      }),
    );

    expect(item.activityAt).toBe("2026-07-06T12:00:00.000Z");
  });

  it("falls back to saved after a skipped listing is restored to none", () => {
    const [item] = buildMySweepsHistory(
      [listing()],
      snapshot({
        primary: { "listing-1": "none" },
        saved: { "listing-1": true },
        activity: {
          "listing-1": {
            skippedAt: "2026-07-05T12:00:00.000Z",
            updatedAt: "2026-07-06T12:00:00.000Z",
          },
        },
      }),
    );

    expect(item.state).toBe("saved");
    expect(item.stateLabel).toBe("Saved");
  });
});

describe("filterAndSortMySweepsListings", () => {
  const listings = [
    listing({
      id: "title",
      title: "Alpine Escape",
      prizeName: "Cabin stay",
      originalSponsorName: "Northwind Travel",
    }),
    listing({
      id: "prize",
      title: "Ride Away",
      prizeName: "Electric bike",
      host: {
        id: "host-1",
        name: "Velocity Works",
        verificationStatus: "self_verified",
      },
    }),
  ];

  it.each([
    ["alpine", "title"],
    ["electric", "prize"],
    ["northwind", "title"],
    ["velocity", "prize"],
  ])("searches title, prize, and sponsor for %s", (query, expectedId) => {
    const result = filterAndSortMySweepsListings(
      listings,
      EMPTY_ROUTINE_SNAPSHOT,
      query,
      "deadline",
      NOW,
    );

    expect(result.map((item) => item.id)).toEqual([expectedId]);
  });

  it("puts active deadlines first, then recently ended listings", () => {
    const result = filterAndSortMySweepsListings(
      [
        listing({ id: "later", endDate: "2026-07-20" }),
        listing({
          id: "expired-old",
          lifecycleStatus: "expired",
          endDate: "2026-07-01",
        }),
        listing({ id: "soon", endDate: "2026-07-11" }),
        listing({
          id: "expired-recent",
          lifecycleStatus: "expired",
          endDate: "2026-07-09",
        }),
      ],
      EMPTY_ROUTINE_SNAPSHOT,
      "",
      "deadline",
      NOW,
    );

    expect(result.map((item) => item.id)).toEqual([
      "soon",
      "later",
      "expired-recent",
      "expired-old",
    ]);
  });

  it.each<[MySweepsSort, string[]]>([
    ["recent", ["recent", "middle", "old"]],
    ["value", ["middle", "old", "recent"]],
  ])("sorts by %s without mutating the input", (sort, expectedIds) => {
    const input = [
      listing({ id: "old", prizeValue: 200 }),
      listing({ id: "recent", prizeValue: undefined }),
      listing({ id: "middle", prizeValue: 900 }),
    ];
    const result = filterAndSortMySweepsListings(
      input,
      snapshot({
        activity: {
          old: { updatedAt: "2026-07-01T12:00:00.000Z" },
          middle: { updatedAt: "2026-07-05T12:00:00.000Z" },
          recent: { updatedAt: "2026-07-09T12:00:00.000Z" },
        },
      }),
      "",
      sort,
      NOW,
    );

    expect(result.map((item) => item.id)).toEqual(expectedIds);
    expect(input.map((item) => item.id)).toEqual(["old", "recent", "middle"]);
  });
});
