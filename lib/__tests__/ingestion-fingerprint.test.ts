import { describe, expect, it } from "vitest";
import {
  contentFingerprint,
  dedupKeys,
  explainDuplicate,
  isLikelyDuplicate,
  normalizeText,
  normalizeUrl,
  officialUrlKey,
} from "@/lib/ingestion/fingerprint";

describe("normalizeUrl", () => {
  it("unifies scheme, www, case, tracking params, fragment, and trailing slash", () => {
    expect(
      normalizeUrl("http://WWW.Example.com/Sweeps/?utm_source=x&b=2&a=1#rules"),
    ).toBe("https://example.com/Sweeps?a=1&b=2");
  });

  it("treats http and https as the same identity", () => {
    expect(normalizeUrl("http://brand.com/win")).toBe(
      normalizeUrl("https://brand.com/win/"),
    );
  });

  it("keeps meaningful query params but drops all utm_/click ids", () => {
    expect(normalizeUrl("https://b.com/x?gclid=abc&id=42&utm_medium=cpc")).toBe(
      "https://b.com/x?id=42",
    );
  });

  it("returns null for junk or non-http schemes", () => {
    expect(normalizeUrl("not a url")).toBeNull();
    expect(normalizeUrl("mailto:a@b.com")).toBeNull();
    expect(normalizeUrl(null)).toBeNull();
  });
});

describe("officialUrlKey", () => {
  it("prefers the official rules URL over the entry URL", () => {
    expect(
      officialUrlKey("https://brand.com/rules", "https://sweepsblog.com/go?to=brand"),
    ).toBe("https://brand.com/rules");
  });

  it("falls back to the entry URL when no rules URL parses", () => {
    expect(officialUrlKey(null, "https://brand.com/enter")).toBe(
      "https://brand.com/enter",
    );
  });
});

describe("normalizeText", () => {
  it("lowercases, strips punctuation, and folds diacritics", () => {
    expect(normalizeText("  Café  DELUXE!! ")).toBe("cafe deluxe");
  });
});

describe("contentFingerprint", () => {
  it("is stable across cosmetic variation", () => {
    const a = contentFingerprint({
      sponsorName: "ACME, Inc.",
      prizeName: "$10,000 Cash",
      endDate: "2026-08-01",
      eligibilityCountry: "US",
    });
    const b = contentFingerprint({
      sponsorName: "acme inc",
      prizeName: "$10000  cash",
      endDate: "2026-08-01T00:00:00.000Z",
      eligibilityCountry: "us",
    });
    expect(a).toBe(b);
  });

  it("changes when the sweep is materially different", () => {
    const base = { sponsorName: "ACME", prizeName: "Cash", endDate: "2026-08-01" };
    expect(contentFingerprint(base)).not.toBe(
      contentFingerprint({ ...base, prizeName: "Truck" }),
    );
    expect(contentFingerprint(base)).not.toBe(
      contentFingerprint({ ...base, endDate: "2026-09-01" }),
    );
    expect(contentFingerprint({ ...base, eligibilityStates: ["CA"] })).toBe(
      contentFingerprint({ ...base, eligibilityStates: ["NY"] }),
    );
  });
});

describe("isLikelyDuplicate", () => {
  it("matches two discovery sources pointing at the same official page", () => {
    const fromBlogA = dedupKeys({
      prizeName: "Dream Trip",
      sponsorName: "Brand",
      endDate: "2026-08-01",
      officialRulesUrl: "https://brand.com/official-rules",
      entryUrl: "https://bloga.com/out?u=brand",
    });
    const fromBlogB = dedupKeys({
      prizeName: "Win a Dream Trip!",
      sponsorName: "Brand",
      endDate: "2026-08-01",
      officialRulesUrl: "https://www.brand.com/official-rules/?utm_source=blogb",
      entryUrl: "https://blogb.com/redirect?to=brand",
    });
    expect(isLikelyDuplicate(fromBlogA, fromBlogB)).toBe(true);
  });

  it("falls back to content identity when URLs are absent", () => {
    const a = dedupKeys({ sponsorName: "Brand", prizeName: "Cash", endDate: "2026-08-01" });
    const b = dedupKeys({ sponsorName: "brand", prizeName: "cash", endDate: "2026-08-01" });
    expect(a.urlKey).toBeNull();
    expect(isLikelyDuplicate(a, b)).toBe(true);
  });

  it("requires matching variants for cross-URL content identity", () => {
    const us = dedupKeys({
      sponsorName: "Brand",
      prizeName: "Cash",
      endDate: "2026-08-01",
      eligibilityCountry: "US",
      eligibilityStates: ["CA"],
      officialRulesUrl: "https://brand.example/rules",
    });
    const regional = dedupKeys({
      sponsorName: "Brand",
      prizeName: "Cash",
      endDate: "2026-08-01",
      eligibilityCountry: "US",
      eligibilityStates: ["NY"],
      officialRulesUrl: "https://campaign.example/official",
    });
    expect(us.contentKey).toBe(regional.contentKey);
    expect(isLikelyDuplicate(us, regional)).toBe(false);
  });

  it("canonicalizes variant states exactly and preserves unknown versus explicit empty", () => {
    expect(
      dedupKeys({ endDate: "2026-08-01", eligibilityCountry: " US ", eligibilityStates: [" NY ", "ca", "CA", ""] }).variantKey,
    ).toBe("2026-08-01|us|ca,ny");
    expect(dedupKeys({ eligibilityStates: null }).variantKey).toBe("?|?|?");
    expect(dedupKeys({ eligibilityStates: [] }).variantKey).toBe("?|?|none");
  });

  it("falls back to content identity when official URLs differ", () => {
    const a = dedupKeys({
      sponsorName: "Brand",
      prizeName: "Cash",
      endDate: "2026-08-01",
      officialRulesUrl: "https://brand.example/rules",
    });
    const b = dedupKeys({
      sponsorName: "brand",
      prizeName: "cash",
      endDate: "2026-08-01",
      officialRulesUrl: "https://campaign.example/official",
    });
    expect(isLikelyDuplicate(a, b)).toBe(true);
  });

  it("does not collapse annual cycles that reuse one official URL", () => {
    const current = dedupKeys({
      sponsorName: "Brand",
      prizeName: "Trip",
      endDate: "2026-08-01",
      eligibilityCountry: "US",
      eligibilityStates: [],
      officialRulesUrl: "https://brand.example/rules",
    });
    const next = dedupKeys({
      sponsorName: "Brand",
      prizeName: "Trip",
      endDate: "2027-08-01",
      eligibilityCountry: "US",
      eligibilityStates: [],
      officialRulesUrl: "https://brand.example/rules",
    });
    expect(isLikelyDuplicate(current, next)).toBe(false);
  });

  it("does not collapse state variants that reuse one official URL", () => {
    const california = dedupKeys({
      sponsorName: "Brand",
      prizeName: "Trip",
      endDate: "2026-08-01",
      eligibilityCountry: "US",
      eligibilityStates: ["CA"],
      officialRulesUrl: "https://brand.example/rules",
    });
    const newYork = dedupKeys({
      sponsorName: "Brand",
      prizeName: "Trip",
      endDate: "2026-08-01",
      eligibilityCountry: "US",
      eligibilityStates: ["NY"],
      officialRulesUrl: "https://brand.example/rules",
    });
    expect(isLikelyDuplicate(california, newYork)).toBe(false);
  });

  it("does not merge genuinely different sweeps", () => {
    const a = dedupKeys({
      prizeName: "Cash",
      sponsorName: "Brand A",
      officialRulesUrl: "https://a.com/rules",
    });
    const b = dedupKeys({
      prizeName: "Truck",
      sponsorName: "Brand B",
      officialRulesUrl: "https://b.com/rules",
    });
    expect(isLikelyDuplicate(a, b)).toBe(false);
  });
});

describe("explainDuplicate — explainable, and safe with variants", () => {
  it("calls a shared official URL conclusively identical", () => {
    const result = explainDuplicate(
      { officialRulesUrl: "https://brand.com/rules", sponsorName: "Brand", prizeName: "Trip" },
      { officialRulesUrl: "https://www.brand.com/rules/?utm_source=x", sponsorName: "Brand", prizeName: "Win a Trip" },
    );
    expect(result.verdict).toBe("identical");
    expect(result.strength).toBe(1);
    expect(result.signals.find((s) => s.id === "same_official_url")?.matched).toBe(true);
  });

  it("routes same-URL unknown-to-known identity to review", () => {
    const result = explainDuplicate(
      { officialRulesUrl: "https://brand.com/rules", sponsorName: "Brand", prizeName: "Trip" },
      {
        officialRulesUrl: "https://brand.com/rules",
        sponsorName: "Brand",
        prizeName: "Trip",
        endDate: "2026-08-01",
        eligibilityCountry: "US",
        eligibilityStates: ["CA"],
      },
    );
    expect(result.verdict).toBe("suspected");
    expect(result.reason).toMatch(/unknown/i);
  });

  it("suspects a duplicate when sponsor+prize agree and a discriminator agrees", () => {
    const result = explainDuplicate(
      { sponsorName: "Northwind", prizeName: "Kitchen Makeover", endDate: "2026-08-01", eligibilityCountry: "US" },
      { sponsorName: "northwind", prizeName: "kitchen makeover", endDate: "2026-08-01", eligibilityCountry: "US" },
    );
    expect(result.verdict).toBe("suspected");
    expect(result.reason).toMatch(/confirm before merging/i);
  });

  it("keeps a US and a Canada-only variant DISTINCT — same sponsor/prize, different region", () => {
    const result = explainDuplicate(
      { sponsorName: "Laurentide", prizeName: "Cabin Getaway", endDate: "2026-10-05", eligibilityCountry: "US" },
      { sponsorName: "Laurentide", prizeName: "Cabin Getaway", endDate: "2026-10-05", eligibilityCountry: "CA" },
    );
    // Same sponsor, same prize, same end date — but different country. The
    // country contradiction must NOT be overridden by the date agreement into a
    // false merge; regional variants are distinct sweepstakes.
    expect(result.signals.find((s) => s.id === "same_country")?.matched).toBe(false);
    expect(result.verdict).toBe("distinct");
  });

  it("keeps this year's and last year's relaunch DISTINCT — same sponsor/prize, different date", () => {
    const result = explainDuplicate(
      { sponsorName: "Roasted Daily", prizeName: "Year of Coffee", endDate: "2025-08-31", eligibilityCountry: "US" },
      { sponsorName: "Roasted Daily", prizeName: "Year of Coffee", endDate: "2026-08-31", eligibilityCountry: "US" },
    );
    expect(result.verdict).toBe("distinct");
    expect(result.reason).toMatch(/regional or recurring variant/i);
  });

  it("keeps same-URL recurring and state variants distinct", () => {
    const recurring = explainDuplicate(
      {
        officialRulesUrl: "https://brand.example/rules",
        sponsorName: "Brand",
        prizeName: "Trip",
        endDate: "2026-08-01",
        eligibilityCountry: "US",
        eligibilityStates: ["CA"],
      },
      {
        officialRulesUrl: "https://brand.example/rules",
        sponsorName: "Brand",
        prizeName: "Trip",
        endDate: "2027-08-01",
        eligibilityCountry: "US",
        eligibilityStates: ["CA"],
      },
    );
    expect(recurring.verdict).toBe("distinct");

    const regional = explainDuplicate(
      {
        officialRulesUrl: "https://brand.example/rules",
        sponsorName: "Brand",
        prizeName: "Trip",
        endDate: "2026-08-01",
        eligibilityCountry: "US",
        eligibilityStates: ["CA"],
      },
      {
        officialRulesUrl: "https://brand.example/rules",
        sponsorName: "Brand",
        prizeName: "Trip",
        endDate: "2026-08-01",
        eligibilityCountry: "US",
        eligibilityStates: ["NY"],
      },
    );
    expect(regional.verdict).toBe("distinct");
  });

  it("returns distinct with low strength for unrelated sweeps", () => {
    const result = explainDuplicate(
      { sponsorName: "Brand A", prizeName: "Cash", endDate: "2026-08-01", eligibilityCountry: "US" },
      { sponsorName: "Brand B", prizeName: "Truck", endDate: "2026-09-01", eligibilityCountry: "CA" },
    );
    expect(result.verdict).toBe("distinct");
    expect(result.strength).toBe(0);
  });

  it("always lists every signal it weighed", () => {
    const result = explainDuplicate(
      { sponsorName: "X", prizeName: "Y" },
      { sponsorName: "X", prizeName: "Y" },
    );
    expect(result.signals.map((s) => s.id).sort()).toEqual([
      "same_country",
      "same_end_date",
      "same_entry_url",
      "same_official_url",
      "same_prize",
      "same_sponsor",
      "same_states",
    ]);
  });
});
