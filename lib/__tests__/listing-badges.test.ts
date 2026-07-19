import { describe, expect, it } from "vitest";
import { computeBadges, daysUntil, isExpired } from "@/lib/listing-badges";
import type { Listing } from "@/lib/types/listing";

// Fixed reference "now" so every test is deterministic regardless of the
// machine clock. 2026-07-06T00:00:00.000Z, matching the project's current date.
const NOW = new Date("2026-07-06T00:00:00.000Z");

function makeListing(overrides: Partial<Listing> = {}): Listing {
  return {
    id: "listing-1",
    slug: "listing-1",
    title: "Test Listing",
    shortDescription: "A short description.",
    prizeName: "A Great Prize",
    entryUrl: "https://example.com/enter",
    endDate: "2026-07-20T00:00:00.000Z",
    entryFrequency: "one_time",
    sourceLabel: "found_by_sweepza",
    lifecycleStatus: "active",
    listingVerificationStatus: "unreviewed",
    ...overrides,
  };
}

describe("daysUntil", () => {
  it("treats timestamps as their date-only sweep deadline", () => {
    expect(daysUntil("2026-07-06T12:00:00.000Z", NOW)).toBe(0);
  });

  it("returns the exact whole-day count when the difference is a whole day", () => {
    expect(daysUntil("2026-07-09T00:00:00.000Z", NOW)).toBe(3);
  });

  it("returns 0 when the end date is exactly now", () => {
    expect(daysUntil("2026-07-06T00:00:00.000Z", NOW)).toBe(0);
  });

  it("returns a negative number when the end date is in the past", () => {
    expect(daysUntil("2026-07-01T00:00:00.000Z", NOW)).toBeLessThan(0);
  });
});

describe("isExpired", () => {
  it("is true when lifecycleStatus is 'expired', even with a future endDate", () => {
    const listing = makeListing({
      lifecycleStatus: "expired",
      endDate: "2026-08-01T00:00:00.000Z",
    });
    expect(isExpired(listing, NOW)).toBe(true);
  });

  it("is true when endDate is in the past, regardless of lifecycleStatus", () => {
    const listing = makeListing({
      lifecycleStatus: "active",
      endDate: "2026-07-01T00:00:00.000Z",
    });
    expect(isExpired(listing, NOW)).toBe(true);
  });

  it("is false when endDate is today or in the future and lifecycleStatus is not 'expired'", () => {
    const endsToday = makeListing({
      lifecycleStatus: "active",
      endDate: "2026-07-06T00:00:00.000Z",
    });
    const endsFuture = makeListing({
      lifecycleStatus: "active",
      endDate: "2026-07-20T00:00:00.000Z",
    });
    expect(isExpired(endsToday, NOW)).toBe(false);
    expect(isExpired(endsFuture, NOW)).toBe(false);
  });
});

describe("computeBadges", () => {
  describe("urgency precedence", () => {
    it("shows 'Expired' when lifecycleStatus is expired, even if days remain", () => {
      const listing = makeListing({
        lifecycleStatus: "expired",
        endDate: "2026-08-01T00:00:00.000Z",
      });
      const badges = computeBadges(listing, NOW, "UTC");
      expect(badges.find((b) => b.id === "expired")).toEqual({
        id: "expired",
        label: "Expired",
        tone: "urgent",
      });
      expect(badges.find((b) => b.id === "ends-today")).toBeUndefined();
      expect(badges.find((b) => b.id === "ends-soon")).toBeUndefined();
    });

    it("shows 'Expired' (not 'Ends Today') when the end date is in the past", () => {
      const listing = makeListing({
        lifecycleStatus: "active",
        endDate: "2026-07-01T00:00:00.000Z",
      });
      const badges = computeBadges(listing, NOW);
      expect(badges.find((b) => b.id === "expired")).toBeTruthy();
      expect(badges.find((b) => b.id === "ends-today")).toBeUndefined();
    });

    it("shows 'Ends Today' when the end date is exactly now", () => {
      const listing = makeListing({ endDate: "2026-07-06T00:00:00.000Z" });
      const badges = computeBadges(listing, NOW, "UTC");
      expect(badges.find((b) => b.id === "ends-today")).toEqual({
        id: "ends-today",
        label: "Ends Today",
        tone: "urgent",
      });
      expect(badges.find((b) => b.id === "expired")).toBeUndefined();
      expect(badges.find((b) => b.id === "ends-soon")).toBeUndefined();
    });

    it("shows 'Ends Soon' at the 3-day boundary", () => {
      const listing = makeListing({ endDate: "2026-07-09T00:00:00.000Z" });
      const badges = computeBadges(listing, NOW);
      expect(badges.find((b) => b.id === "ends-soon")).toEqual({
        id: "ends-soon",
        label: "Ends Soon",
        tone: "urgent",
      });
    });

    it("shows no urgency badge just past the 3-day 'Ends Soon' boundary", () => {
      const listing = makeListing({ endDate: "2026-07-10T00:00:00.000Z" });
      const badges = computeBadges(listing, NOW);
      expect(badges.find((b) => b.id === "expired")).toBeUndefined();
      expect(badges.find((b) => b.id === "ends-today")).toBeUndefined();
      expect(badges.find((b) => b.id === "ends-soon")).toBeUndefined();
    });
  });

  describe("host-verified badge", () => {
    it("shows 'Verified' for a self_verified host", () => {
      const listing = makeListing({
        host: { id: "h1", name: "Host", verificationStatus: "self_verified" },
      });
      const badges = computeBadges(listing, NOW);
      expect(badges.find((b) => b.id === "verified")).toEqual({
        id: "verified",
        label: "Verified",
        tone: "trust",
      });
    });

    it("shows 'Verified' for an admin_verified host", () => {
      const listing = makeListing({
        host: { id: "h1", name: "Host", verificationStatus: "admin_verified" },
      });
      const badges = computeBadges(listing, NOW);
      expect(badges.find((b) => b.id === "verified")).toBeTruthy();
    });

    it("does not show 'Verified' for a host with verificationStatus 'none'", () => {
      const listing = makeListing({
        host: { id: "h1", name: "Host", verificationStatus: "none" },
      });
      const badges = computeBadges(listing, NOW);
      expect(badges.find((b) => b.id === "verified")).toBeUndefined();
    });

    it("does not show 'Verified' when there is no host", () => {
      const listing = makeListing({ host: undefined });
      const badges = computeBadges(listing, NOW);
      expect(badges.find((b) => b.id === "verified")).toBeUndefined();
    });
  });

  describe("verified-listing badge", () => {
    it("shows 'Verified Listing' when listingVerificationStatus is 'verified'", () => {
      const listing = makeListing({ listingVerificationStatus: "verified" });
      const badges = computeBadges(listing, NOW);
      expect(badges.find((b) => b.id === "verified-listing")).toEqual({
        id: "verified-listing",
        label: "Verified Listing",
        tone: "trust",
      });
    });

    it("does not show 'Verified Listing' for other statuses", () => {
      for (const status of ["unreviewed", "reviewed", "rejected"] as const) {
        const listing = makeListing({ listingVerificationStatus: status });
        const badges = computeBadges(listing, NOW);
        expect(badges.find((b) => b.id === "verified-listing")).toBeUndefined();
      }
    });
  });

  describe("entry-type labels", () => {
    it.each([
      ["one_time", "One-Time"],
      ["daily", "Daily"],
      ["weekly", "Weekly"],
      ["monthly", "Monthly"],
      ["instant_win", "Instant Win"],
    ] as const)("labels entryFrequency '%s' as '%s'", (freq, label) => {
      const listing = makeListing({ entryFrequency: freq });
      const badges = computeBadges(listing, NOW);
      expect(badges.find((b) => b.id === `entry-${freq}`)).toEqual({
        id: `entry-${freq}`,
        label,
        tone: "entry",
      });
    });

    it("produces no entry badge for entryFrequency 'other'", () => {
      const listing = makeListing({ entryFrequency: "other" });
      const badges = computeBadges(listing, NOW);
      expect(badges.find((b) => b.tone === "entry")).toBeUndefined();
    });
  });

  describe("featured/boosted", () => {
    it("shows 'Featured' when isFeatured is true", () => {
      const listing = makeListing({ isFeatured: true });
      const badges = computeBadges(listing, NOW);
      expect(badges.find((b) => b.id === "featured")).toEqual({
        id: "featured",
        label: "Featured",
        tone: "promo",
      });
    });

    it("shows 'Boosted' when isBoosted is true", () => {
      const listing = makeListing({ isBoosted: true });
      const badges = computeBadges(listing, NOW);
      expect(badges.find((b) => b.id === "boosted")).toEqual({
        id: "boosted",
        label: "Boosted",
        tone: "promo",
      });
    });

    it("shows both when both flags are set", () => {
      const listing = makeListing({ isFeatured: true, isBoosted: true });
      const badges = computeBadges(listing, NOW);
      expect(badges.find((b) => b.id === "featured")).toBeTruthy();
      expect(badges.find((b) => b.id === "boosted")).toBeTruthy();
    });

    it("shows neither when both flags are unset", () => {
      const listing = makeListing({ isFeatured: false, isBoosted: false });
      const badges = computeBadges(listing, NOW);
      expect(badges.find((b) => b.id === "featured")).toBeUndefined();
      expect(badges.find((b) => b.id === "boosted")).toBeUndefined();
    });
  });

  it("shows 'Winner Reported' when winnerReported is true", () => {
    const listing = makeListing({ winnerReported: true });
    const badges = computeBadges(listing, NOW);
    expect(badges.find((b) => b.id === "winner-reported")).toEqual({
      id: "winner-reported",
      label: "Winner Reported",
      tone: "proof",
    });
  });

  it("does not show 'Winner Reported' when winnerReported is falsy", () => {
    const listing = makeListing({ winnerReported: false });
    const badges = computeBadges(listing, NOW);
    expect(badges.find((b) => b.id === "winner-reported")).toBeUndefined();
  });

  describe("official-rules badge", () => {
    it("shows 'Official Rules' only when officialRulesUrl is set", () => {
      const withUrl = makeListing({ officialRulesUrl: "https://example.com/rules" });
      const withoutUrl = makeListing({ officialRulesUrl: undefined });
      expect(computeBadges(withUrl, NOW).find((b) => b.id === "official-rules")).toEqual({
        id: "official-rules",
        label: "Official Rules",
        tone: "trust",
      });
      expect(
        computeBadges(withoutUrl, NOW).find((b) => b.id === "official-rules"),
      ).toBeUndefined();
    });
  });

  describe("'new' badge", () => {
    it("shows 'New' when published today", () => {
      const listing = makeListing({ publishedAt: "2026-07-06T00:00:00.000Z" });
      const badges = computeBadges(listing, NOW);
      expect(badges.find((b) => b.id === "new")).toEqual({
        id: "new",
        label: "New",
        tone: "fresh",
      });
    });

    it("shows 'New' at exactly the 7-day boundary", () => {
      const listing = makeListing({ publishedAt: "2026-06-29T00:00:00.000Z" });
      const badges = computeBadges(listing, NOW);
      expect(badges.find((b) => b.id === "new")).toBeTruthy();
    });

    it("does not show 'New' just past the 7-day boundary", () => {
      const listing = makeListing({ publishedAt: "2026-06-28T00:00:00.000Z" });
      const badges = computeBadges(listing, NOW);
      expect(badges.find((b) => b.id === "new")).toBeUndefined();
    });

    it("does not show 'New' when publishedAt is missing", () => {
      const listing = makeListing({ publishedAt: undefined });
      const badges = computeBadges(listing, NOW);
      expect(badges.find((b) => b.id === "new")).toBeUndefined();
    });
  });
});
