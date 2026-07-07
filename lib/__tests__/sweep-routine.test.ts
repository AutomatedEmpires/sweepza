import { describe, expect, it } from "vitest";
import {
  EMPTY_ROUTINE_SNAPSHOT,
  buildRecentActivity,
  buildRoutineBuckets,
  isReadyAgain,
  nextEntryAt,
  type RoutineSnapshot,
} from "@/lib/sweep-routine";
import type { Listing } from "@/lib/types/listing";

const DAY_MS = 24 * 60 * 60 * 1000;
// Fixed mid-day reference so day-boundary math is deterministic.
const NOW = new Date("2026-07-06T12:00:00");

function listing(overrides: Partial<Listing> = {}): Listing {
  return {
    id: "l-1",
    slug: "test-sweep",
    title: "Test Sweep",
    shortDescription: "A test sweepstake",
    prizeName: "Prize",
    entryUrl: "https://example.com/enter",
    endDate: new Date(NOW.getTime() + 10 * DAY_MS).toISOString(),
    entryFrequency: "one_time",
    sourceLabel: "found_by_sweepza",
    lifecycleStatus: "active",
    listingVerificationStatus: "unreviewed",
    ...overrides,
  } as Listing;
}

function snapshot(partial: Partial<RoutineSnapshot>): RoutineSnapshot {
  return { ...EMPTY_ROUTINE_SNAPSHOT, ...partial };
}

describe("nextEntryAt", () => {
  const entered = "2026-07-05T15:30:00";

  it("daily re-opens at the start of the next local day", () => {
    const next = nextEntryAt(entered, "daily")!;
    expect(next.getHours()).toBe(0);
    expect(next.getMinutes()).toBe(0);
    expect(next.getDate()).toBe(6);
  });

  it("instant_win follows the daily cadence", () => {
    expect(nextEntryAt(entered, "instant_win")!.getTime()).toBe(
      nextEntryAt(entered, "daily")!.getTime(),
    );
  });

  it("weekly is a rolling 7-day window", () => {
    expect(nextEntryAt(entered, "weekly")!.getTime()).toBe(
      new Date(entered).getTime() + 7 * DAY_MS,
    );
  });

  it("monthly is a rolling 30-day window", () => {
    expect(nextEntryAt(entered, "monthly")!.getTime()).toBe(
      new Date(entered).getTime() + 30 * DAY_MS,
    );
  });

  it("one_time and other never re-open", () => {
    expect(nextEntryAt(entered, "one_time")).toBeNull();
    expect(nextEntryAt(entered, "other")).toBeNull();
  });

  it("rejects invalid timestamps", () => {
    expect(nextEntryAt("not-a-date", "daily")).toBeNull();
  });
});

describe("isReadyAgain", () => {
  it("is false without an enteredAt record", () => {
    expect(isReadyAgain(listing({ entryFrequency: "daily" }), undefined, NOW)).toBe(false);
    expect(isReadyAgain(listing({ entryFrequency: "daily" }), {}, NOW)).toBe(false);
  });

  it("is true when a daily entry from yesterday has re-opened", () => {
    const activity = { enteredAt: "2026-07-05T09:00:00" };
    expect(isReadyAgain(listing({ entryFrequency: "daily" }), activity, NOW)).toBe(true);
  });

  it("is false when today's daily entry hasn't reset yet", () => {
    const activity = { enteredAt: "2026-07-06T08:00:00" };
    expect(isReadyAgain(listing({ entryFrequency: "daily" }), activity, NOW)).toBe(false);
  });

  it("is false for one_time entries regardless of age", () => {
    const activity = { enteredAt: "2026-06-01T08:00:00" };
    expect(isReadyAgain(listing({ entryFrequency: "one_time" }), activity, NOW)).toBe(false);
  });

  it("is false once the listing has expired", () => {
    const activity = { enteredAt: "2026-07-01T08:00:00" };
    const ended = listing({
      entryFrequency: "daily",
      endDate: new Date(NOW.getTime() - 2 * DAY_MS).toISOString(),
    });
    expect(isReadyAgain(ended, activity, NOW)).toBe(false);
  });
});

describe("buildRoutineBuckets", () => {
  it("routes saved-not-entered active listings into ready", () => {
    const l = listing();
    const buckets = buildRoutineBuckets(
      [l],
      snapshot({ primary: { "l-1": "saved" }, saved: { "l-1": true } }),
      NOW,
    );
    expect(buckets.ready.map((x) => x.id)).toEqual(["l-1"]);
    expect(buckets.saved.map((x) => x.id)).toEqual(["l-1"]);
    expect(buckets.entered).toHaveLength(0);
  });

  it("keeps a won listing in won even after it expires (history permanence)", () => {
    const ended = listing({
      lifecycleStatus: "expired",
      endDate: new Date(NOW.getTime() - 5 * DAY_MS).toISOString(),
    });
    const buckets = buildRoutineBuckets(
      [ended],
      snapshot({
        primary: { "l-1": "won" },
        activity: { "l-1": { enteredAt: "2026-06-20T10:00:00", wonAt: "2026-07-01T10:00:00" } },
      }),
      NOW,
    );
    expect(buckets.won.map((x) => x.id)).toEqual(["l-1"]);
    // Won listings never appear in the actionable queues.
    expect(buckets.ready).toHaveLength(0);
    expect(buckets.readyAgain).toHaveLength(0);
    expect(buckets.endingSoon).toHaveLength(0);
  });

  it("keeps an entered listing in entered after expiry", () => {
    const ended = listing({
      lifecycleStatus: "expired",
      endDate: new Date(NOW.getTime() - DAY_MS).toISOString(),
    });
    const buckets = buildRoutineBuckets(
      [ended],
      snapshot({
        primary: { "l-1": "entered" },
        activity: { "l-1": { enteredAt: "2026-07-01T10:00:00" } },
      }),
      NOW,
    );
    expect(buckets.entered.map((x) => x.id)).toEqual(["l-1"]);
    expect(buckets.readyAgain).toHaveLength(0);
  });

  it("keeps skipped listings out of actionable buckets even with prior entry activity", () => {
    const daily = listing({ entryFrequency: "daily" });
    const buckets = buildRoutineBuckets(
      [daily],
      snapshot({
        primary: { "l-1": "skipped" },
        activity: {
          "l-1": {
            enteredAt: "2026-07-05T10:00:00",
            skippedAt: "2026-07-06T09:00:00",
          },
        },
      }),
      NOW,
    );
    expect(buckets.skipped.map((x) => x.id)).toEqual(["l-1"]);
    expect(buckets.entered).toHaveLength(0);
    expect(buckets.readyAgain).toHaveLength(0);
    expect(buckets.endingSoon).toHaveLength(0);
  });

  it("puts tracked listings ending within 3 days into endingSoon", () => {
    const closing = listing({
      endDate: new Date(NOW.getTime() + 2 * DAY_MS).toISOString(),
    });
    const buckets = buildRoutineBuckets(
      [closing],
      snapshot({ primary: { "l-1": "saved" }, saved: { "l-1": true } }),
      NOW,
    );
    expect(buckets.endingSoon.map((x) => x.id)).toEqual(["l-1"]);
  });

  it("ignores untouched listings entirely", () => {
    const buckets = buildRoutineBuckets([listing()], EMPTY_ROUTINE_SNAPSHOT, NOW);
    expect(
      Object.values(buckets).every((bucket) => bucket.length === 0),
    ).toBe(true);
  });

  it("sorts ready by end date ascending and saved by savedAt descending", () => {
    const a = listing({ id: "a", endDate: new Date(NOW.getTime() + 9 * DAY_MS).toISOString() });
    const b = listing({ id: "b", endDate: new Date(NOW.getTime() + 1 * DAY_MS).toISOString() });
    const buckets = buildRoutineBuckets(
      [a, b],
      snapshot({
        primary: { a: "saved", b: "saved" },
        saved: { a: true, b: true },
        activity: {
          a: { savedAt: "2026-07-06T10:00:00" },
          b: { savedAt: "2026-07-01T10:00:00" },
        },
      }),
      NOW,
    );
    expect(buckets.ready.map((x) => x.id)).toEqual(["b", "a"]);
    expect(buckets.saved.map((x) => x.id)).toEqual(["a", "b"]);
  });
});

describe("buildRecentActivity", () => {
  it("reports the highest-signal action per listing, newest first, limited", () => {
    const listings = [
      listing({ id: "a" }),
      listing({ id: "b" }),
      listing({ id: "c" }),
    ];
    const items = buildRecentActivity(
      listings,
      snapshot({
        activity: {
          a: { savedAt: "2026-07-01T10:00:00" },
          b: { enteredAt: "2026-07-03T10:00:00", savedAt: "2026-07-02T10:00:00" },
          c: { wonAt: "2026-07-05T10:00:00", enteredAt: "2026-06-20T10:00:00" },
        },
      }),
      2,
    );
    expect(items.map((i) => [i.listing.id, i.state])).toEqual([
      ["c", "won"],
      ["b", "entered"],
    ]);
  });

  it("skips activity for listings not in the provided set", () => {
    const items = buildRecentActivity(
      [listing({ id: "a" })],
      snapshot({ activity: { ghost: { savedAt: "2026-07-01T10:00:00" } } }),
    );
    expect(items).toHaveLength(0);
  });
});
