import { describe, expect, it } from "vitest";
import { FAQ_ITEMS } from "@/lib/faq";
import { TRUST_BAND_ITEMS } from "@/lib/trust-copy";

// Public trust copy must never claim more than the platform enforces.
// The data model allows published listings without an official-rules link
// (`official_rules_exception`, see listing_publish_guard), allows hosts with
// `verification_status = 'none'`, never verifies that an entry URL is
// sponsor-owned, and review is a manual queue with no SLA. So universal
// rules-link claims, blanket verification claims, sponsor-ownership claims,
// and timing promises are banned. What we DO claim maps to hard mechanisms:
// the free-to-enter listing policy, the public serving boundary that only
// returns reviewed/verified rows (lib/db/listings.ts), and the structural
// fact that entries happen off-platform via the listing's entry_url.
//
// Each banned family carries positive fixtures — representative phrasings
// that MUST be caught — so the detectors are themselves regression-proofed
// against wording drift ("provided for all listings", "all hosts are
// verified", …), not just the historical phrases.
interface BannedFamily {
  name: string;
  reason: string;
  patterns: RegExp[];
  /** Phrasings this family must catch (each must match >=1 pattern). */
  fixtures: string[];
}

const BANNED_FAMILIES: BannedFamily[] = [
  {
    name: "universal official-rules claims",
    reason: "published listings may carry a documented rules exception",
    patterns: [
      /official rules (?:\w+ ){0,3}(?:on|for|with|to) (?:each|every|all)\b/i,
      /(?:each|every|all) listings? (?:links?|includes?|carr(?:y|ies)|comes? with|provides?|has|have)[^.]*rules/i,
    ],
    fixtures: [
      "Official rules on every listing",
      "official rules are provided for all listings",
      "official rules linked on each listing",
      "Each listing links to the sponsor's official rules",
      "all listings include official rules",
      "every listing comes with the official rules",
    ],
  },
  {
    name: "blanket verification claims",
    reason: "hosts may be unverified; 'Verified' is a per-listing badge",
    patterns: [
      /verified hosts/i,
      /(?:all|every|each) (?:host|listing|source)s? (?:is|are) verified/i,
      /(?:hosts|listings|sources) are verified/i,
    ],
    fixtures: [
      "Verified hosts, honest sources",
      "all hosts are verified",
      "every listing is verified",
      "our sources are verified",
    ],
  },
  {
    name: "sponsor-ownership claims about entry links",
    reason: "nothing verifies that an entry URL is sponsor-owned",
    patterns: [/sponsor'?s official (?:page|site|entry)/i, /enter on the sponsor/i],
    fixtures: [
      "Enter on the sponsor's official page",
      "entry happens on the sponsor's official site",
    ],
  },
  {
    name: "guarantees",
    reason: "a directory listing guarantees nothing about the promotion",
    patterns: [/guarantee/i],
    fixtures: ["guaranteed winners", "we guarantee every prize"],
  },
  {
    name: "review-timing promises",
    reason: "review is a manual queue with no SLA",
    patterns: [
      /same[- ]day/i,
      /within (?:minutes|hours|\d)/i,
      /instant(?:ly)? (?:approv|publish|list)/i,
    ],
    fixtures: [
      "published the same day",
      "approved within hours",
      "instantly listed",
    ],
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

describe("banned-claim detectors catch their own family", () => {
  for (const family of BANNED_FAMILIES) {
    it(`"${family.name}" catches every fixture phrasing`, () => {
      for (const fixture of family.fixtures) {
        const caught = family.patterns.some((pattern) => pattern.test(fixture));
        expect(caught, `expected a pattern to catch: "${fixture}"`).toBe(true);
      }
    });
  }
});

describe("honest trust copy", () => {
  for (const surface of SURFACES) {
    for (const family of BANNED_FAMILIES) {
      it(`${surface.name} makes no "${family.name}" (${family.reason})`, () => {
        for (const text of surface.texts) {
          for (const pattern of family.patterns) {
            expect(text).not.toMatch(pattern);
          }
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
    // Public serving boundary only returns reviewed/verified rows.
    expect(labels.some((label) => label.includes("reviewed"))).toBe(true);
    // Entries are structurally off-platform (external entry_url).
    expect(labels.some((label) => label.includes("host's site"))).toBe(true);
  });

  it("FAQ still states the no-purchase-necessary canon", () => {
    const allAnswers = FAQ_ITEMS.map((item) => item.answer).join(" ");
    expect(allAnswers).toMatch(/no purchase is ever necessary/i);
  });
});
