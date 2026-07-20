import { describe, expect, it } from "vitest";
import {
  dryRunIdentityKey,
  dryRunIngestion,
  type DryRunLeadInput,
} from "@/lib/ingestion/dry-run";
import { dedupKeys } from "@/lib/ingestion/fingerprint";
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
    expect(report.results[0].disposition).toBe("would_create_private_draft");
    expect(report.results[0].confidence).toBeGreaterThan(0.5);
  });

  it("would hold a candidate lacking affirmative no-purchase for review", () => {
    const report = dryRunIngestion("sweeps_advantage", [
      completeLead("https://sponsor.example.com/b", { noPurchaseNecessary: null }),
    ]);
    expect(report.results[0].disposition).toBe("would_hold_no_write");
    expect(report.results[0].hardFailures).toContain("no_purchase_necessary");
  });

  it("would hold an extraction missing required fields without creating a row", () => {
    const report = dryRunIngestion("sweeps_advantage", [
      { officialUrl: "https://x.example.com", extraction: { title: null, prizeName: null } },
    ]);
    expect(report.results[0].disposition).toBe("would_hold_no_write");
  });

  it("skips a lead already in the catalog (idempotency)", () => {
    const lead = completeLead("https://sponsor.example.com/known");
    const knownKey = dryRunIdentityKey(dedupKeys({
      officialRulesUrl: lead.extraction.officialRulesUrl,
      entryUrl: lead.extraction.entryUrl,
      endDate: lead.extraction.endDate,
      eligibilityCountry: lead.extraction.eligibilityCountry,
      eligibilityStates: lead.extraction.eligibilityStates,
    }));
    expect(knownKey).not.toBeNull();
    const report = dryRunIngestion("sweeps_advantage", [lead], {
      knownIdentityKeys: new Set([knownKey!]),
    });
    expect(report.results[0].disposition).toBe("would_skip_known");
    expect(report.results[0].confidence).toBeGreaterThan(0.5);
  });

  it("holds an invalid revisit before checking its known URL+variant identity", () => {
    const lead = completeLead("https://sponsor.example.com/known-invalid", {
      shortDescription: null,
    });
    const knownKey = dryRunIdentityKey(dedupKeys({
      officialRulesUrl: lead.extraction.officialRulesUrl,
      entryUrl: lead.extraction.entryUrl,
      endDate: lead.extraction.endDate,
      eligibilityCountry: lead.extraction.eligibilityCountry,
      eligibilityStates: lead.extraction.eligibilityStates,
    }));
    const report = dryRunIngestion("sweeps_advantage", [lead], {
      knownIdentityKeys: new Set([knownKey!]),
    });
    expect(report.results[0].disposition).toBe("would_hold_no_write");
    expect(report.results[0].hardFailures).toContain("has_short_description");
  });

  it("keeps a reused URL with a different cycle as a distinct private draft", () => {
    const prior = completeLead("https://sponsor.example.com/reused", { endDate: "2098-12-31" });
    const current = completeLead("https://sponsor.example.com/reused", { endDate: "2099-12-31" });
    const report = dryRunIngestion("sweeps_advantage", [prior, current]);
    expect(report.results.map((result) => result.disposition)).toEqual([
      "would_create_private_draft",
      "would_create_private_draft",
    ]);
  });

  it("creates a separate private draft and suspected pair for content-only matches", () => {
    const a = completeLead("https://sponsor.example.com/enter-a");
    const b = completeLead("https://sponsor.example.com/enter-b");
    const report = dryRunIngestion("sweeps_advantage", [a, b]);
    expect(report.results[0].disposition).toBe("would_create_private_draft");
    expect(report.results[1].disposition).toBe("would_create_suspected_pair");
    expect(report.results[1].duplicateOf).toBe(a.officialUrl);
  });

  it("returns the existing draft for an exact URL+variant claim in the batch", () => {
    const a = completeLead("https://sponsor.example.com/exact");
    const b = completeLead("https://discovery.example.com/other", {
      officialRulesUrl: a.extraction.officialRulesUrl,
      entryUrl: a.extraction.entryUrl,
    });
    const report = dryRunIngestion("sweeps_advantage", [a, b]);
    expect(report.results[1].disposition).toBe("would_skip_known");
    expect(report.results[1].confidence).toBeGreaterThan(0.5);
  });

  it("holds an invalid exact duplicate before the intra-batch identity check", () => {
    const a = completeLead("https://sponsor.example.com/exact-invalid");
    const b = completeLead("https://discovery.example.com/other-invalid", {
      officialRulesUrl: a.extraction.officialRulesUrl,
      entryUrl: a.extraction.entryUrl,
      prizeName: null,
    });
    const report = dryRunIngestion("sweeps_advantage", [a, b]);
    expect(report.results[1].disposition).toBe("would_hold_no_write");
    expect(report.results[1].hardFailures).toContain("has_prize_name");
  });

  it("produces a coherent report for the built-in samples", () => {
    const report = dryRunIngestion("sweeps_advantage", SAMPLE_DRY_RUN_LEADS);
    // Clean draft, two no-write holds, and a suspected private-draft pair.
    expect(report.totals.leads).toBe(4);
    expect(report.totals.wouldCreatePrivateDraft).toBe(1);
    expect(report.totals.wouldCreateSuspectedPair).toBe(1);
    expect(report.totals.wouldHoldNoWrite).toBe(2);
  });
});
