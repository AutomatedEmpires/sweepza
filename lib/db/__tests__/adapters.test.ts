import { describe, expect, it } from "vitest";
import {
  CATEGORY_CODE_TO_PRIZE_CATEGORY,
  PRIZE_CATEGORY_TO_CATEGORY_CODE,
  prizeCategoryFromCode,
  toListing,
  toListingHost,
} from "@/lib/db/adapters";
import type { HostPublicRow, ListingRow } from "@/lib/db/types";

function makeListingRow(overrides: Partial<ListingRow> = {}): ListingRow {
  return {
    id: "row-1",
    slug: "row-1-slug",
    title: "Row Title",
    short_description: "Short description.",
    long_description: null,
    prize_name: "A Great Prize",
    prize_value: null,
    prize_currency: null,
    prize_category: null,
    winner_count: null,
    main_image_url: null,
    image_source_type: null,
    image_alt_text: null,
    category_fallback_image: null,
    entry_url: "https://example.com/enter",
    official_rules_url: null,
    start_date: null,
    end_date: "2026-08-01",
    entry_frequency: "one_time",
    entry_limit_notes: null,
    eligibility_country: null,
    eligibility_states: null,
    age_requirement: null,
    no_purchase_necessary: null,
    source_type: "owner_seeded",
    public_source_label: "found_by_sweepza",
    created_by_role: "owner",
    created_by_user_id: null,
    host_id: null,
    sponsor_name: null,
    sponsor_url: null,
    sponsor_logo_url: null,
    sponsor_notes_internal: null,
    lifecycle_status: "active",
    visibility_status: "public",
    moderation_status: "clear",
    duplicate_status: "clear",
    listing_verification_status: "unreviewed",
    is_featured: false,
    review_notes_internal: null,
    review_notes: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    published_at: null,
    ...overrides,
  };
}

function makeHostRow(overrides: Partial<HostPublicRow> = {}): HostPublicRow {
  return {
    id: "host-1",
    display_name: "Acme Sweepstakes",
    logo_url: null,
    website_url: null,
    short_description: null,
    verification_status: "none",
    ...overrides,
  };
}

describe("category code <-> PrizeCategory mapping", () => {
  it.each([
    ["cash", "Cash"],
    ["gift_cards", "Gift Cards"],
    ["travel", "Travel"],
    ["vehicles", "Vehicles"],
    ["electronics", "Electronics"],
    ["outdoor", "Outdoor Gear"],
    ["home", "Home Goods"],
    ["food_beverage", "Food/Beverage"],
    ["fashion_beauty", "Beauty/Fashion"],
    ["family_kids", "Family/Kids"],
    ["seasonal", "Seasonal/Holiday"],
  ] as const)("maps code '%s' to display string '%s'", (code, label) => {
    expect(CATEGORY_CODE_TO_PRIZE_CATEGORY[code]).toBe(label);
    expect(prizeCategoryFromCode(code)).toBe(label);
  });

  it("builds a reverse map from display string back to code", () => {
    expect(PRIZE_CATEGORY_TO_CATEGORY_CODE["Cash"]).toBe("cash");
    expect(PRIZE_CATEGORY_TO_CATEGORY_CODE["Beauty/Fashion"]).toBe("fashion_beauty");
    expect(PRIZE_CATEGORY_TO_CATEGORY_CODE["Seasonal/Holiday"]).toBe("seasonal");
  });

  it("maps unknown codes to undefined", () => {
    expect(prizeCategoryFromCode("not_a_real_code")).toBeUndefined();
  });

  it("maps 'experiences' to undefined (no PrizeCategory projection)", () => {
    expect(prizeCategoryFromCode("experiences")).toBeUndefined();
  });

  it("maps 'other' to undefined (no PrizeCategory projection)", () => {
    expect(prizeCategoryFromCode("other")).toBeUndefined();
  });

  it("maps null/undefined codes to undefined", () => {
    expect(prizeCategoryFromCode(null)).toBeUndefined();
    expect(prizeCategoryFromCode(undefined)).toBeUndefined();
  });
});

describe("toListing", () => {
  it("maps null optional DB fields to undefined in the UI shape", () => {
    const row = makeListingRow({
      prize_value: null,
      prize_currency: null,
      main_image_url: null,
      image_alt_text: null,
      category_fallback_image: null,
      official_rules_url: null,
      start_date: null,
      entry_limit_notes: null,
      eligibility_country: null,
      eligibility_states: null,
      age_requirement: null,
      sponsor_name: null,
      published_at: null,
      winner_count: null,
    });

    const listing = toListing(row);

    expect(listing.prizeValue).toBeUndefined();
    expect(listing.prizeCurrency).toBeUndefined();
    expect(listing.mainImageUrl).toBeUndefined();
    expect(listing.imageAltText).toBeUndefined();
    expect(listing.categoryFallbackImageUrl).toBeUndefined();
    expect(listing.officialRulesUrl).toBeUndefined();
    expect(listing.startDate).toBeUndefined();
    expect(listing.entryLimitNotes).toBeUndefined();
    expect(listing.eligibilityCountry).toBeUndefined();
    expect(listing.eligibilityStates).toBeUndefined();
    expect(listing.ageRequirement).toBeUndefined();
    expect(listing.originalSponsorName).toBeUndefined();
    expect(listing.publishedAt).toBeUndefined();
    expect(listing.winnerCount).toBeUndefined();
  });

  it("passes through non-null optional fields", () => {
    const row = makeListingRow({
      prize_value: 500,
      prize_currency: "USD",
      main_image_url: "https://example.com/img.png",
      image_alt_text: "alt text",
      category_fallback_image: "https://example.com/fallback.png",
      official_rules_url: "https://example.com/rules",
      start_date: "2026-07-01",
      entry_limit_notes: "one entry per day",
      eligibility_country: "US",
      eligibility_states: ["CA", "NY"],
      age_requirement: 18,
      sponsor_name: "Acme Corp",
      published_at: "2026-07-05T00:00:00.000Z",
      winner_count: 3,
    });

    const listing = toListing(row);

    expect(listing.prizeValue).toBe(500);
    expect(listing.prizeCurrency).toBe("USD");
    expect(listing.mainImageUrl).toBe("https://example.com/img.png");
    expect(listing.imageAltText).toBe("alt text");
    expect(listing.categoryFallbackImageUrl).toBe("https://example.com/fallback.png");
    expect(listing.officialRulesUrl).toBe("https://example.com/rules");
    expect(listing.startDate).toBe("2026-07-01");
    expect(listing.entryLimitNotes).toBe("one entry per day");
    expect(listing.eligibilityCountry).toBe("US");
    expect(listing.eligibilityStates).toEqual(["CA", "NY"]);
    expect(listing.ageRequirement).toBe(18);
    expect(listing.originalSponsorName).toBe("Acme Corp");
    expect(listing.publishedAt).toBe("2026-07-05T00:00:00.000Z");
    expect(listing.winnerCount).toBe(3);
  });

  it("maps prize_category through the code -> display string projection", () => {
    const row = makeListingRow({ prize_category: "fashion_beauty" });
    expect(toListing(row).prizeCategory).toBe("Beauty/Fashion");
  });

  it("falls back entryUrl to '' when entry_url is null", () => {
    const row = makeListingRow({ entry_url: null });
    expect(toListing(row).entryUrl).toBe("");
  });

  it("falls back endDate to '' when end_date is null", () => {
    const row = makeListingRow({ end_date: null });
    expect(toListing(row).endDate).toBe("");
  });

  it("falls back entryFrequency to 'other' when entry_frequency is null", () => {
    const row = makeListingRow({ entry_frequency: null });
    expect(toListing(row).entryFrequency).toBe("other");
  });

  it("passes through lifecycleStatus, listingVerificationStatus, isFeatured and sourceLabel", () => {
    const row = makeListingRow({
      lifecycle_status: "paused",
      listing_verification_status: "verified",
      is_featured: true,
      public_source_label: "host_submitted",
    });
    const listing = toListing(row);
    expect(listing.lifecycleStatus).toBe("paused");
    expect(listing.listingVerificationStatus).toBe("verified");
    expect(listing.isFeatured).toBe(true);
    expect(listing.sourceLabel).toBe("host_submitted");
  });

  describe("host joining", () => {
    it("maps the joined host row through toListingHost, including verificationStatus", () => {
      const row = makeListingRow({ host_id: "host-1" });
      const hostRow = makeHostRow({
        id: "host-1",
        display_name: "Acme Sweepstakes",
        verification_status: "admin_verified",
        logo_url: "https://example.com/logo.png",
      });

      const listing = toListing(row, { host: hostRow });

      expect(listing.host).toEqual({
        id: "host-1",
        name: "Acme Sweepstakes",
        logoUrl: "https://example.com/logo.png",
        verificationStatus: "admin_verified",
      });
    });

    it("leaves logoUrl undefined when logo_url is null", () => {
      const hostRow = makeHostRow({ logo_url: null });
      expect(toListingHost(hostRow).logoUrl).toBeUndefined();
    });

    it("leaves host undefined when no host is provided in context", () => {
      const row = makeListingRow({ host_id: null });
      expect(toListing(row, {}).host).toBeUndefined();
      expect(toListing(row).host).toBeUndefined();
    });

    it("leaves host undefined when ctx.host is explicitly null", () => {
      const row = makeListingRow();
      expect(toListing(row, { host: null }).host).toBeUndefined();
    });
  });

  describe("context-derived flags", () => {
    it("sets winnerReported from ctx.winnerReported", () => {
      const row = makeListingRow();
      expect(toListing(row, { winnerReported: true }).winnerReported).toBe(true);
      expect(toListing(row, { winnerReported: false }).winnerReported).toBe(false);
      expect(toListing(row, {}).winnerReported).toBeUndefined();
    });

    it("sets isBoosted from ctx.isBoosted", () => {
      const row = makeListingRow();
      expect(toListing(row, { isBoosted: true }).isBoosted).toBe(true);
      expect(toListing(row, { isBoosted: false }).isBoosted).toBe(false);
      expect(toListing(row, {}).isBoosted).toBeUndefined();
    });

    it("passes through ctx.tagLabels as tags", () => {
      const row = makeListingRow();
      expect(toListing(row, { tagLabels: ["Instant Win", "No Purchase Necessary"] }).tags).toEqual([
        "Instant Win",
        "No Purchase Necessary",
      ]);
      expect(toListing(row, {}).tags).toBeUndefined();
    });
  });
});
