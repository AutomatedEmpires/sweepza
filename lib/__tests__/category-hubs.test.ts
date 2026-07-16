import { describe, expect, it } from "vitest";
import {
  CANONICAL_CATEGORY_CODES,
  CATEGORY_HUBS,
  EXCLUDED_CATEGORY_CODES,
  PROJECTION_CODES,
  getCategoryHub,
} from "@/lib/category-hubs";

// The hubs are the programmatic-SEO surface over the CANONICAL category
// dictionary. These tests enforce the partition — every canonical code either
// has exactly one landing page or is deliberately excluded with a stated
// reason — so a taxonomy change can never silently orphan (or fabricate) a
// hub, and the copy can never regress past the canon bright-lines.
describe("category hubs", () => {
  it("partitions the canonical dictionary: hubs + documented exclusions", () => {
    const hubCodes = CATEGORY_HUBS.map((hub) => hub.code);
    const covered = [...hubCodes, ...EXCLUDED_CATEGORY_CODES].sort();
    expect(covered).toEqual([...CANONICAL_CATEGORY_CODES].sort());
    // No code may be both hubbed and excluded.
    for (const excluded of EXCLUDED_CATEGORY_CODES) {
      expect(hubCodes).not.toContain(excluded);
    }
  });

  it("covers every UI-projection code (chips must never point nowhere)", () => {
    const hubCodes = new Set(CATEGORY_HUBS.map((hub) => hub.code));
    for (const code of PROJECTION_CODES) {
      expect(hubCodes.has(code), `projection code ${code}`).toBe(true);
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
    expect(getCategoryHub("experiences")?.code).toBe("experiences");
    expect(getCategoryHub("no-such-category")).toBeUndefined();
    // Route params must be slugs, not raw dictionary codes.
    expect(getCategoryHub("gift_cards")).toBeUndefined();
    // Excluded codes have no hub at all.
    expect(getCategoryHub("other")).toBeUndefined();
  });

  it("carries honest, non-empty SEO copy on every hub", () => {
    for (const hub of CATEGORY_HUBS) {
      expect(hub.title.length, `${hub.slug} title`).toBeGreaterThan(10);
      expect(hub.description.length, `${hub.slug} description`).toBeGreaterThan(
        60,
      );
      const copy = `${hub.title} ${hub.description}`.toLowerCase();
      // Canon bright-lines: never promise wins or imply paid entry...
      expect(copy, `${hub.slug} promises`).not.toContain("guarantee");
      expect(copy, `${hub.slug} promises`).not.toContain("purchase required");
      // ...and never make per-listing claims the data model does not enforce
      // (unreviewed listings can be public; official-rules exceptions exist).
      expect(copy, `${hub.slug} verification claim`).not.toContain("verified");
      expect(copy, `${hub.slug} rules claim`).not.toContain("official rules");
    }
  });
});
