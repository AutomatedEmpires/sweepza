import { describe, expect, it } from "vitest";
import {
  CATEGORY_HUBS,
  DICTIONARY_CODES,
  DICTIONARY_LABELS,
  getCategoryHub,
} from "@/lib/category-hubs";

// The hubs are the programmatic-SEO surface over the controlled taxonomy.
// These tests enforce the bijection: every dictionary category has exactly one
// landing page, and every landing page maps to a real dictionary code — so a
// taxonomy change can never silently orphan (or fabricate) a hub.
describe("category hubs", () => {
  it("covers every dictionary category exactly once", () => {
    const hubCodes = CATEGORY_HUBS.map((hub) => hub.code).sort();
    expect(hubCodes).toEqual([...DICTIONARY_CODES].sort());
  });

  it("uses canonical labels from the dictionary", () => {
    const labels = new Set<string>(DICTIONARY_LABELS);
    for (const hub of CATEGORY_HUBS) {
      expect(labels.has(hub.label), `${hub.slug} label`).toBe(true);
    }
  });

  it("has unique, URL-safe, hyphenated slugs", () => {
    const slugs = CATEGORY_HUBS.map((hub) => hub.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const slug of slugs) {
      expect(slug).toMatch(/^[a-z]+(-[a-z]+)*$/);
    }
  });

  it("resolves hubs by slug and rejects unknown slugs", () => {
    expect(getCategoryHub("gift-cards")?.code).toBe("gift_cards");
    expect(getCategoryHub("beauty-fashion")?.code).toBe("fashion_beauty");
    expect(getCategoryHub("no-such-category")).toBeUndefined();
    // Route params must be slugs, not raw dictionary codes.
    expect(getCategoryHub("gift_cards")).toBeUndefined();
  });

  it("carries honest, non-empty SEO copy on every hub", () => {
    for (const hub of CATEGORY_HUBS) {
      expect(hub.title.length, `${hub.slug} title`).toBeGreaterThan(10);
      expect(hub.description.length, `${hub.slug} description`).toBeGreaterThan(
        60,
      );
      // Canon bright lines: never promise wins or imply paid entry.
      expect(hub.description.toLowerCase()).not.toContain("guarantee");
      expect(hub.description.toLowerCase()).not.toContain("purchase required");
    }
  });
});
