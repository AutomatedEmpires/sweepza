import { describe, expect, it } from "vitest";
import { FAQ_ITEMS } from "@/lib/faq";
import { TRUST_BAND_ITEMS } from "@/lib/trust-copy";

// Public trust copy must never claim more than the platform enforces.
// The data model allows published listings without an official-rules link
// (`official_rules_exception`, see listing_publish_guard) and allows hosts
// with `verification_status = 'none'`, and review is a manual queue with no
// SLA — so universal rules/verification claims and timing promises are
// banned. What we DO claim maps to hard mechanisms: the admin review gate,
// the publish guard's required entry_url, and the free-to-enter listing
// policy.
const BANNED_OVERCLAIMS: { pattern: RegExp; reason: string }[] = [
  {
    pattern: /official rules on (each|every)/i,
    reason: "published listings may carry a documented rules exception",
  },
  {
    pattern: /(each|every) listing links/i,
    reason: "the rules link is not universal — exception listings exist",
  },
  {
    pattern: /official rules linked on (each|every)/i,
    reason: "the rules link is not universal — exception listings exist",
  },
  {
    pattern: /verified hosts/i,
    reason: "hosts may be unverified; 'Verified' is a per-listing badge",
  },
  {
    pattern: /guarantee/i,
    reason: "a directory listing guarantees nothing about the promotion",
  },
  {
    pattern: /same[- ]day|within (minutes|hours|\d)/i,
    reason: "review is a manual queue with no SLA",
  },
  {
    pattern: /instant(ly)? (approv|publish|list)/i,
    reason: "review is a manual queue with no SLA",
  },
];

const SURFACES: { name: string; texts: string[] }[] = [
  {
    name: "homepage trust band",
    texts: TRUST_BAND_ITEMS.map((item) => item.label),
  },
  {
    name: "FAQ",
    texts: FAQ_ITEMS.flatMap((item) => [item.question, item.answer]),
  },
];

describe("honest trust copy", () => {
  for (const surface of SURFACES) {
    for (const { pattern, reason } of BANNED_OVERCLAIMS) {
      it(`${surface.name} never matches ${pattern} (${reason})`, () => {
        for (const text of surface.texts) {
          expect(text).not.toMatch(pattern);
        }
      });
    }
  }

  it("trust band stays three short, non-empty claims", () => {
    expect(TRUST_BAND_ITEMS).toHaveLength(3);
    for (const item of TRUST_BAND_ITEMS) {
      expect(item.label.trim().length).toBeGreaterThan(0);
      // Band renders at 13px in a three-up grid; keep claims scannable.
      expect(item.label.length).toBeLessThanOrEqual(48);
    }
  });

  it("keeps the claims that map to enforced mechanisms", () => {
    const labels = TRUST_BAND_ITEMS.map((item) => item.label.toLowerCase());
    // Listing policy: free, no purchase necessary.
    expect(labels.some((label) => label.includes("free to enter"))).toBe(true);
    // Admin review gate + DB publish guard.
    expect(labels.some((label) => label.includes("reviewed"))).toBe(true);
    // publish guard requires entry_url; entries happen on the sponsor's page.
    expect(labels.some((label) => label.includes("sponsor's official page"))).toBe(
      true,
    );
  });

  it("FAQ still states the no-purchase-necessary canon", () => {
    const allAnswers = FAQ_ITEMS.map((item) => item.answer).join(" ");
    expect(allAnswers).toMatch(/no purchase is ever necessary/i);
  });
});
