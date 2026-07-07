import { describe, expect, it } from "vitest";
import { filterListings, sortListings } from "@/lib/listing-filters";
import type { Listing } from "@/lib/types/listing";

// Fixed reference "now" so every test is deterministic regardless of the
// machine clock. 2026-07-06T00:00:00.000Z, matching the project's current date.
const NOW = new Date("2026-07-06T00:00:00.000Z");

let counter = 0;
function makeListing(overrides: Partial<Listing> = {}): Listing {
  counter += 1;
  return {
    id: `listing-${counter}`,
    slug: `listing-${counter}`,
    title: "Test Listing",
    shortDescription: "A short description.",
    prizeName: "A Great Prize",
    entryUrl: "https://example.com/enter",
    endDate: "2026-08-01T00:00:00.000Z",
    entryFrequency: "one_time",
    sourceLabel: "found_by_sweepza",
    lifecycleStatus: "active",
    listingVerificationStatus: "unreviewed",
    ...overrides,
  };
}

describe("filterListings", () => {
  it("returns the input unchanged when the active array is empty", () => {
    const listings = [makeListing(), makeListing()];
    expect(filterListings(listings, [], NOW)).toBe(listings);
  });

  it("ORs chips within the same group (ends_today, ends_soon are both 'timing')", () => {
    const endsToday = makeListing({ endDate: "2026-07-06T00:00:00.000Z" });
    const endsSoon = makeListing({ endDate: "2026-07-08T00:00:00.000Z" });
    const endsLater = makeListing({ endDate: "2026-08-01T00:00:00.000Z" });

    const result = filterListings(
      [endsToday, endsSoon, endsLater],
      ["ends_today", "ends_soon"],
      NOW,
    );

    expect(result).toEqual(expect.arrayContaining([endsToday, endsSoon]));
    expect(result).toHaveLength(2);
    expect(result).not.toContain(endsLater);
  });

  it("ANDs across groups (ends_today [timing] AND verified [trust])", () => {
    const endsTodayVerified = makeListing({
      endDate: "2026-07-06T00:00:00.000Z",
      host: { id: "h1", name: "Host", verificationStatus: "self_verified" },
    });
    const endsTodayUnverified = makeListing({
      endDate: "2026-07-06T00:00:00.000Z",
      host: { id: "h2", name: "Host", verificationStatus: "none" },
    });
    const verifiedButEndsLater = makeListing({
      endDate: "2026-08-01T00:00:00.000Z",
      host: { id: "h3", name: "Host", verificationStatus: "self_verified" },
    });

    const result = filterListings(
      [endsTodayVerified, endsTodayUnverified, verifiedButEndsLater],
      ["ends_today", "verified"],
      NOW,
    );

    expect(result).toEqual([endsTodayVerified]);
  });

  describe("individual chip predicates", () => {
    it("'new' matches listings published within the last 7 days", () => {
      const fresh = makeListing({ publishedAt: "2026-07-01T00:00:00.000Z" });
      const stale = makeListing({ publishedAt: "2026-06-01T00:00:00.000Z" });
      const unpublished = makeListing({ publishedAt: undefined });

      const result = filterListings([fresh, stale, unpublished], ["new"], NOW);
      expect(result).toEqual([fresh]);
    });

    it("'ends_today' matches only listings ending today (and not expired ones)", () => {
      const endsToday = makeListing({ endDate: "2026-07-06T00:00:00.000Z" });
      const alreadyExpired = makeListing({ endDate: "2026-07-01T00:00:00.000Z" });
      const endsLater = makeListing({ endDate: "2026-07-10T00:00:00.000Z" });

      const result = filterListings(
        [endsToday, alreadyExpired, endsLater],
        ["ends_today"],
        NOW,
      );
      expect(result).toEqual([endsToday]);
    });

    it("'ends_soon' matches listings ending within 3 days, excluding today and expired", () => {
      const endsToday = makeListing({ endDate: "2026-07-06T00:00:00.000Z" });
      const endsSoon = makeListing({ endDate: "2026-07-09T00:00:00.000Z" });
      const endsLater = makeListing({ endDate: "2026-07-10T00:00:00.000Z" });
      const alreadyExpired = makeListing({ endDate: "2026-07-01T00:00:00.000Z" });

      const result = filterListings(
        [endsToday, endsSoon, endsLater, alreadyExpired],
        ["ends_soon"],
        NOW,
      );
      expect(result).toEqual([endsSoon]);
    });

    it("'daily' matches only entryFrequency 'daily'", () => {
      const daily = makeListing({ entryFrequency: "daily" });
      const weekly = makeListing({ entryFrequency: "weekly" });

      const result = filterListings([daily, weekly], ["daily"], NOW);
      expect(result).toEqual([daily]);
    });

    it("'instant_win' matches only entryFrequency 'instant_win'", () => {
      const instantWin = makeListing({ entryFrequency: "instant_win" });
      const oneTime = makeListing({ entryFrequency: "one_time" });

      const result = filterListings([instantWin, oneTime], ["instant_win"], NOW);
      expect(result).toEqual([instantWin]);
    });

    describe("'verified'", () => {
      it("matches a self_verified host", () => {
        const listing = makeListing({
          host: { id: "h1", name: "Host", verificationStatus: "self_verified" },
        });
        expect(filterListings([listing], ["verified"], NOW)).toEqual([listing]);
      });

      it("matches an admin_verified host", () => {
        const listing = makeListing({
          host: { id: "h1", name: "Host", verificationStatus: "admin_verified" },
        });
        expect(filterListings([listing], ["verified"], NOW)).toEqual([listing]);
      });

      it("matches listingVerificationStatus 'verified' even without a verified host", () => {
        const listing = makeListing({
          listingVerificationStatus: "verified",
          host: { id: "h1", name: "Host", verificationStatus: "none" },
        });
        expect(filterListings([listing], ["verified"], NOW)).toEqual([listing]);
      });

      it("excludes listings with neither a verified host nor a verified listing status", () => {
        const listing = makeListing({
          listingVerificationStatus: "unreviewed",
          host: { id: "h1", name: "Host", verificationStatus: "none" },
        });
        expect(filterListings([listing], ["verified"], NOW)).toEqual([]);
      });
    });
  });
});

describe("sortListings", () => {
  it("'newest' sorts by publishedAt descending", () => {
    const oldest = makeListing({ publishedAt: "2026-01-01T00:00:00.000Z" });
    const middle = makeListing({ publishedAt: "2026-03-01T00:00:00.000Z" });
    const newest = makeListing({ publishedAt: "2026-06-01T00:00:00.000Z" });

    const result = sortListings([middle, oldest, newest], "newest", NOW);
    expect(result).toEqual([newest, middle, oldest]);
  });

  it("'ending_soon' sorts by endDate ascending", () => {
    const endsFirst = makeListing({ endDate: "2026-07-07T00:00:00.000Z" });
    const endsSecond = makeListing({ endDate: "2026-07-15T00:00:00.000Z" });
    const endsThird = makeListing({ endDate: "2026-08-01T00:00:00.000Z" });

    const result = sortListings([endsThird, endsFirst, endsSecond], "ending_soon", NOW);
    expect(result).toEqual([endsFirst, endsSecond, endsThird]);
  });

  describe("'recommended'", () => {
    it("ranks boosted above featured above plain", () => {
      const plain = makeListing({ endDate: "2026-09-01T00:00:00.000Z" });
      const featured = makeListing({
        endDate: "2026-09-01T00:00:00.000Z",
        isFeatured: true,
      });
      const boosted = makeListing({
        endDate: "2026-09-01T00:00:00.000Z",
        isBoosted: true,
      });

      const result = sortListings([plain, featured, boosted], "recommended", NOW);
      expect(result).toEqual([boosted, featured, plain]);
    });

    it("sinks expired listings to the bottom regardless of other boosts", () => {
      const expiredButBoosted = makeListing({
        lifecycleStatus: "expired",
        endDate: "2026-09-01T00:00:00.000Z",
        isBoosted: true,
      });
      const plain = makeListing({ endDate: "2026-09-01T00:00:00.000Z" });
      const alsoExpiredByDate = makeListing({
        lifecycleStatus: "active",
        endDate: "2026-06-01T00:00:00.000Z",
      });

      const result = sortListings(
        [expiredButBoosted, plain, alsoExpiredByDate],
        "recommended",
        NOW,
      );

      expect(result[0]).toBe(plain);
      expect(result.slice(1)).toEqual(
        expect.arrayContaining([expiredButBoosted, alsoExpiredByDate]),
      );
    });
  });
});
