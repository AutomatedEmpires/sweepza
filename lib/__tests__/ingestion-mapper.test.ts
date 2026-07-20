import { describe, expect, it } from "vitest";
import { mapExtraction, toIsoDate, type RawExtraction } from "@/lib/ingestion/mapper";
import { verifyCandidate } from "@/lib/ingestion/verify";

const NOW = new Date("2026-07-14T12:00:00.000Z");

function complete(overrides: Partial<RawExtraction> = {}): RawExtraction {
  return {
    title: "  Win a $10,000   Dream Vacation ",
    shortDescription: "Enter daily for a chance at a tropical getaway for two.",
    prizeName: "Tropical Vacation for Two",
    prizeValue: "$10,000",
    prizeCategory: "Travel",
    entryUrl: "https://brand.com/enter?utm_source=blog",
    officialRulesUrl: "https://www.brand.com/official-rules/",
    startDate: "2026-07-01",
    endDate: "2026-08-01",
    entryFrequency: "Enter once per day",
    eligibilityCountry: "United States",
    eligibilityStates: ["ca", "ny"],
    ageRequirement: "18",
    noPurchaseNecessary: "yes",
    sponsorName: "Brand, Inc.",
    ...overrides,
  };
}

describe("toIsoDate", () => {
  it("passes through ISO dates and trims datetimes", () => {
    expect(toIsoDate("2026-08-01")).toBe("2026-08-01");
    expect(toIsoDate("2026-08-01T12:00:00Z")).toBe("2026-08-01");
  });
  it("returns null for junk", () => {
    expect(toIsoDate("someday")).toBeNull();
    expect(toIsoDate(null)).toBeNull();
  });
  it.each(["2026-02-29", "2026-02-30", "2026-04-31", "2026-08-01garbage"])(
    "rejects invalid calendar date %s",
    (value) => {
      expect(toIsoDate(value)).toBeNull();
    },
  );
});

describe("mapExtraction", () => {
  it("normalizes a complete extraction into the canonical shape", () => {
    const { candidate, issues } = mapExtraction(complete());
    expect(issues).toHaveLength(0);
    expect(candidate.title).toBe("Win a $10,000 Dream Vacation");
    expect(candidate.prizeValue).toBe(10000);
    expect(candidate.prizeCategory).toBe("travel");
    expect(candidate.entryFrequency).toBe("daily");
    expect(candidate.eligibilityCountry).toBe("US");
    expect(candidate.eligibilityStates).toEqual(["CA", "NY"]);
    expect(candidate.ageRequirement).toBe(18);
    expect(candidate.noPurchaseNecessary).toBe(true);
    expect(candidate.officialRulesUrl).toBe("https://brand.com/official-rules");
    expect(candidate.dedup.urlKey).toBe("https://brand.com/official-rules");
  });

  it("maps free-text categories by keyword", () => {
    expect(mapExtraction(complete({ prizeCategory: "$500 Visa Gift Card" })).candidate.prizeCategory).toBe("gift_cards");
    expect(mapExtraction(complete({ prizeCategory: "Brand new Ford truck" })).candidate.prizeCategory).toBe("vehicles");
    expect(mapExtraction(complete({ prizeCategory: "4K OLED TV" })).candidate.prizeCategory).toBe("electronics");
  });

  it("defaults unmapped category/frequency to 'other' and flags them", () => {
    const { candidate, issues } = mapExtraction(
      complete({ prizeCategory: "quantum widgets", entryFrequency: "whenever" }),
    );
    expect(candidate.prizeCategory).toBe("other");
    expect(candidate.entryFrequency).toBe("other");
    expect(issues.some((i) => i.includes("category"))).toBe(true);
    expect(issues.some((i) => i.includes("frequency"))).toBe(true);
  });

  it("collects issues for missing required fields without throwing", () => {
    const { candidate, issues } = mapExtraction({
      title: "",
      prizeName: "",
      officialRulesUrl: "not a url",
      endDate: "someday",
    });
    expect(candidate.title).toBe("");
    expect(candidate.officialRulesUrl).toBeNull();
    expect(candidate.endDate).toBeNull();
    expect(candidate.eligibilityStates).toBeNull();
    expect(candidate.dedup.variantKey).toContain("|?");
    expect(issues).toEqual(
      expect.arrayContaining([
        "Missing title.",
        "Missing prize name.",
        "Missing or invalid official rules URL.",
        "Missing or unparseable end date.",
      ]),
    );
  });

  it("truncates over-long title and short description with a note", () => {
    const { candidate, issues } = mapExtraction(
      complete({ title: "T".repeat(90), shortDescription: "S".repeat(200) }),
    );
    expect(candidate.title.length).toBe(70);
    expect(candidate.shortDescription.length).toBe(140);
    expect(issues.some((i) => i.includes("truncated"))).toBe(true);
  });
});

describe("verifyCandidate", () => {
  it("passes a complete, in-window candidate", () => {
    const { candidate } = mapExtraction(complete());
    const result = verifyCandidate(candidate, NOW);
    expect(result.publishable).toBe(true);
    expect(result.hardFailures).toHaveLength(0);
    expect(result.confidence).toBeGreaterThan(0.7);
  });

  it("blocks a candidate with no affirmative no-purchase", () => {
    const { candidate } = mapExtraction(complete({ noPurchaseNecessary: null }));
    const result = verifyCandidate(candidate, NOW);
    expect(result.publishable).toBe(false);
    expect(result.hardFailures).toContain("no_purchase_necessary");
  });

  it("blocks a candidate missing the official rules URL", () => {
    const { candidate } = mapExtraction(complete({ officialRulesUrl: null }));
    const result = verifyCandidate(candidate, NOW);
    expect(result.publishable).toBe(false);
    expect(result.hardFailures).toContain("has_official_rules_url");
  });

  it("blocks an already-ended sweep", () => {
    const { candidate } = mapExtraction(complete({ endDate: "2026-07-10" }));
    const result = verifyCandidate(candidate, NOW);
    expect(result.publishable).toBe(false);
    expect(result.hardFailures).toContain("end_date_in_future");
  });

  it("blocks impossible calendar dates before persistence", () => {
    for (const endDate of ["2026-02-29", "2026-02-30", "2026-04-31"]) {
      const { candidate } = mapExtraction(complete({ endDate }));
      expect(candidate.endDate).toBeNull();
      expect(verifyCandidate(candidate, NOW).hardFailures).toContain("end_date_in_future");
    }
  });

  it("stays publishable but lower-confidence when soft checks miss", () => {
    const { candidate } = mapExtraction(
      complete({ prizeCategory: "quantum widgets", prizeValue: null, sponsorName: null }),
    );
    const result = verifyCandidate(candidate, NOW);
    expect(result.publishable).toBe(true);
    expect(result.checks.category_recognized).toBe(false);
    expect(result.confidence).toBeLessThan(1);
  });
});
