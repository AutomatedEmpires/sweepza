import { describe, expect, it } from "vitest";
import {
  contentFingerprint,
  dedupKeys,
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
