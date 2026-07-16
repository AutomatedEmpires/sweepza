import { describe, expect, it } from "vitest";
import { dryRunIngestion, type DryRunLeadInput } from "@/lib/ingestion/dry-run";
import { SAMPLE_DRY_RUN_LEADS } from "@/lib/ingestion/dry-run-samples";

const FUTURE = "2099-12-31";

function completeLead(url: string, overrides = {}): DryRunLeadInput {
  return {
    officialUrl: url,
    extraction: {
      title: "Cash Giveaway",
      shortDescription: "Enter to win five hundred dollars cash.",
      prizeName: "$500 Cash",
      prizeValue: "$500",
      prizeCategory: "cash",
      entryUrl: `${url}/enter`,
      officialRulesUrl: `${url}/rules`,
      endDate: FUTURE,
      entryFrequency: "daily",
      eligibilityCountry: "US",
      ageRequirement: 18,
      noPurchaseNecessary: true,
      sponsorName: "Northwind",
      ...overrides,
    },
  };
}

describe("dryRunIngestion", () => {
  it("never mutates — readOnly is always true", () => {
    const report = dryRunIngestion("x", []);
    expect(report.readOnly).toBe(true);
    expect(report.totals.leads).toBe(0);
  });

  it("would create a complete, affirmative candidate", () => {
    const report = dryRunIngestion("sweeps_advantage", [
      completeLead("https://sponsor.example.com/a"),
    ]);
    expect(report.results[0].disposition).toBe("would_create");
    expect(report.results[0].confidence).toBeGreaterThan(0.5);
  });

  it("would hold a candidate lacking affirmative no-purchase for review", () => {
    const report = dryRunIngestion("sweeps_advantage", [
      completeLead("https://sponsor.example.com/b", { noPurchaseNecessary: null }),
    ]);
    expect(report.results[0].disposition).toBe("would_review");
    expect(report.results[0].hardFailures).toContain("no_purchase_necessary");
  });

  it("would reject an extraction missing required fields", () => {
    const report = dryRunIngestion("sweeps_advantage", [
      { officialUrl: "https://x.example.com", extraction: { title: null, prizeName: null } },
    ]);
    expect(report.results[0].disposition).toBe("would_reject");
  });

  it("skips a lead already in the catalog (idempotency)", () => {
    const lead = completeLead("https://sponsor.example.com/known");
    const report = dryRunIngestion("sweeps_advantage", [lead], {
      knownUrlKeys: new Set(["https://sponsor.example.com/known/rules"]),
    });
    expect(report.results[0].disposition).toBe("would_skip_known");
  });

  it("holds a cross-source duplicate within the batch", () => {
    const a = completeLead("https://sponsor.example.com/enter-a");
    // Same sweep, different discovery URL, same official rules URL.
    const b = completeLead("https://sponsor.example.com/enter-b");
    const report = dryRunIngestion("sweeps_advantage", [a, b]);
    expect(report.results[0].disposition).toBe("would_create");
    expect(report.results[1].disposition).toBe("would_skip_duplicate");
    expect(report.results[1].duplicateOf).toBe(a.officialUrl);
  });

  it("produces a coherent report for the built-in samples", () => {
    const report = dryRunIngestion("sweeps_advantage", SAMPLE_DRY_RUN_LEADS);
    // Clean create, held (no-purchase), duplicate, reject.
    expect(report.totals.leads).toBe(4);
    expect(report.totals.wouldCreate).toBe(1);
    expect(report.totals.wouldReview).toBe(1);
    expect(report.totals.wouldSkipDuplicate).toBe(1);
    expect(report.totals.wouldReject).toBe(1);
  });
});
