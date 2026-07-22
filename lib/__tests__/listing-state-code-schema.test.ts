import { afterEach, describe, expect, it, vi } from "vitest";
import { adminListingImportSchema } from "@/lib/admin-listing-schema";
import {
  hostListingEditSchema,
  hostListingSubmissionSchema,
} from "@/lib/host-listing-schema";

function futureDate(days = 14) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

const common = {
  title: "Official summer prize sweepstakes",
  shortDescription: "Enter on the sponsor page for a chance at the stated prize.",
  longDescription: null,
  prizeName: "Summer prize package",
  prizeValue: 500,
  prizeCategory: "cash",
  mainImageUrl: "https://example.com/prize.jpg",
  imageAltText: "Summer prize package",
  entryUrl: "https://example.com/enter",
  officialRulesUrl: "https://example.com/rules",
  startDate: null,
  endDate: futureDate(),
  entryFrequency: "one_time",
  entryLimitNotes: "One entry per person.",
  eligibilityCountry: "US",
  eligibilityStates: ["ca", " DC ", "CA"],
  ageRequirement: 18,
  noPurchaseNecessary: true,
  sponsorName: "Example Sponsor",
  sponsorUrl: "https://example.com",
  winnerCount: 1,
  tagCodes: [],
};

describe("listing eligibility state codes", () => {
  afterEach(() => vi.useRealTimers());

  it("normalizes and deduplicates controlled state/DC codes", () => {
    const admin = adminListingImportSchema.parse({
      ...common,
      publish: true,
      verified: false,
    });
    const host = hostListingSubmissionSchema.parse(common);

    expect(admin.eligibilityStates).toEqual(["CA", "DC"]);
    expect(host.eligibilityStates).toEqual(["CA", "DC"]);
  });

  it("rejects invented codes on admin and host create paths", () => {
    const invalid = { ...common, eligibilityStates: ["ZZ", "??"] };

    expect(
      adminListingImportSchema.safeParse({
        ...invalid,
        publish: true,
        verified: false,
      }).success,
    ).toBe(false);
    expect(hostListingSubmissionSchema.safeParse(invalid).success).toBe(false);
  });

  it("accepts Canadian provinces only when Canada is the stated country", () => {
    const canada = {
      ...common,
      eligibilityCountry: "Canada",
      eligibilityStates: ["on", " QC ", "ON"],
    };
    const parsed = hostListingSubmissionSchema.parse(canada);
    expect(parsed.eligibilityStates).toEqual(["ON", "QC"]);

    expect(
      hostListingSubmissionSchema.safeParse({
        ...canada,
        eligibilityStates: ["ON", "TX"],
      }).success,
    ).toBe(false);
    expect(
      hostListingSubmissionSchema.safeParse({
        ...common,
        eligibilityStates: ["CA", "ON"],
      }).success,
    ).toBe(false);
  });

  it("uses the canonical UTC-12 date-only boundary for submission", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-22T11:59:59.999Z"));
    expect(
      hostListingSubmissionSchema.safeParse({
        ...common,
        endDate: "2026-07-21",
      }).success,
    ).toBe(true);

    vi.setSystemTime(new Date("2026-07-22T12:00:00.000Z"));
    expect(
      hostListingSubmissionSchema.safeParse({
        ...common,
        endDate: "2026-07-21",
      }).success,
    ).toBe(false);
  });

  it("rejects invented codes on the host edit path", () => {
    const edit = {
      title: common.title,
      short_description: common.shortDescription,
      long_description: null,
      prize_name: common.prizeName,
      prize_value: common.prizeValue,
      prize_category: common.prizeCategory,
      winner_count: common.winnerCount,
      main_image_url: common.mainImageUrl,
      image_alt_text: common.imageAltText,
      entry_url: common.entryUrl,
      official_rules_url: common.officialRulesUrl,
      start_date: null,
      end_date: common.endDate,
      entry_frequency: common.entryFrequency,
      entry_limit_notes: common.entryLimitNotes,
      eligibility_country: common.eligibilityCountry,
      eligibility_states: ["CA", "ZZ"],
      age_requirement: common.ageRequirement,
      no_purchase_necessary: true,
      sponsor_name: common.sponsorName,
      sponsor_url: common.sponsorUrl,
      tag_codes: [],
    };

    const result = hostListingEditSchema.safeParse(edit);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe(
        "Use a valid U.S. state/DC or Canadian province/territory code.",
      );
    }
  });
});
