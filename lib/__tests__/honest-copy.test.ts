import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CATEGORY_HUBS } from "@/lib/category-hubs";
import { FAQ_ITEMS } from "@/lib/faq";
import { TRUST_BAND_ITEMS } from "@/lib/trust-copy";

// Public trust copy must never claim more than the platform enforces.
//
// ⚠️ THIS GUARD EXISTED AND THE SITE LIED ANYWAY — TWICE, the same way both
// times: the detectors were right and SURFACES was short.
//
// Round 1: it scanned two data modules (the trust band and the FAQ) while the
// claims lived elsewhere. `public/llms.txt` said "the sponsor's official entry
// page" twice and `lib/category-hubs.ts` said "the sponsor's entry page" eight
// times: both already banned below, both never looked at.
//
// Round 2: the fix for round 1 added `lib/`, `public/` and `components/` files
// and then asserted, right here, that SURFACES "covers every public claim
// surface". It did not scan a single `app/` route. Seven more surfaces were
// shipping the no-purchase claim the whole time, including the homepage and the
// social OG card. The comment claiming full coverage was itself the kind of
// unbacked assertion this file exists to ban.
//
// So: a detector that does not scan the surface is decoration, and a coverage
// claim is only as good as the enumeration behind it. When you add a
// user-visible string, add its file to SURFACES in the same commit.
//
// The model allows hosts with `verification_status = 'none'`, never verifies
// that an entry URL is sponsor-owned, and review is a manual queue with no SLA.
// So blanket verification claims, sponsor-ownership claims, and timing promises
// are banned.
//
// NO-PURCHASE (the expensive one): `no_purchase_necessary` is nullable, is not
// checked by listing_publish_guard(), and is absent from BOTH write schemas — a
// host cannot affirm it even if they want to. It is a third party's legal
// representation about their own promotion, and it is the phrase separating a
// lawful sweepstakes from an illegal lottery. Sweepza may state its own listing
// POLICY ("we only list free-to-enter sweepstakes" — an editorial commitment
// with a reporting path); it may NOT assert on a specific listing's behalf that
// no purchase is necessary. That distinction is what this family enforces.
//
// UNIVERSAL RULES CLAIMS were banned here for `official_rules_exception` — an
// escape hatch nothing could ever open (both write schemas require a rules URL;
// no writer ever set it). The column is dropped and listing_publish_guard() now
// hard-requires official_rules_url, so that claim is TRUE and the ban is gone.
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
  // REMOVED: "universal official-rules claims". It was banned because
  // `official_rules_exception` "let" a listing publish without a rules link —
  // an escape hatch nothing could open (both write schemas require
  // officialRulesUrl; no writer ever set it true). The column is dropped and
  // listing_publish_guard() hard-requires official_rules_url, so "every listing
  // links to its official rules" is now TRUE and may be said.
  {
    name: "per-listing no-purchase claims",
    reason:
      "no_purchase_necessary is nullable, unchecked by listing_publish_guard(), " +
      "and absent from both write schemas — Sweepza cannot assert it for a promotion it does not run",
    patterns: [
      // The BARE assertion. This is the one that actually shipped, on every
      // listing detail page: "No purchase necessary · See official rules".
      // The first cut of this family had five clever patterns and NONE of them
      // matched it — the detector would have stayed green if the exact phrase
      // it was written for came back. Ban the literal words on any surface that
      // is not policy canon; there is no honest way to state this about a
      // promotion we do not run. (Safe for the negating guidance in llms.txt,
      // which says "requires no purchase" / "no purchase IS necessary" — the
      // word order differs, deliberately.)
      /\bno purchase necessary\b/i,
      // Asserting it OF the listings — the sponsor's legal representation, not ours.
      /(?:each|every|all|any) listed? [^.]*no[- ]purchase/i,
      /no purchase is ever necessary (?:to enter )?(?:any|each|every)/i,
      /(?:always|never) (?:no purchase|pay-to-play|pay to enter)/i,
      /pay-to-enter is never listed/i,
      /(?:each|every|all) listing[^.]*free to enter/i,
      /free to enter[^.]*(?:each|every|all) listing/i,
    ],
    fixtures: [
      // The literal string this PR removed from components/listing-detail.tsx.
      "No purchase necessary · See official rules",
      "No purchase necessary is required — pay-to-enter is never listed.",
      "No purchase is ever necessary to enter any listed sweepstakes",
      "always no purchase necessary",
      "Every listing is free to enter",
      "each listing is free to enter and links to the sponsor's page",
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

/**
 * Read a public claim surface that is not a data module (component / static
 * file), with comments stripped.
 *
 * Stripping matters: the honest fix for a false claim is usually to delete it
 * and leave a comment saying what it used to say and why it was wrong. Scanning
 * raw source makes that comment trip the very detector it documents — the
 * explanation reads as the lie. Only shipped strings are claims.
 */
function source(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ") // block + JSX-adjacent comments
    .replace(/^\s*\/\/.*$/gm, " ") // whole-line //
    .replace(/\s\/\/[^\n"'`]*$/gm, " "); // trailing // (never inside a string)
}

// Every surface that makes a public claim — NOT just the two data modules.
// The trust band and FAQ state Sweepza's own listing POLICY (an editorial
// commitment: what we undertake to list, with a reporting path), which is the
// founder's canon and is a different act from asserting a fact about a specific
// third party's promotion. `policyCanon` marks those two so the per-listing
// no-purchase family does not fire on a policy statement — every other family
// still applies to them.
const SURFACES: { name: string; texts: string[]; policyCanon?: boolean }[] = [
  {
    name: "homepage trust band",
    texts: TRUST_BAND_ITEMS.map((item) => item.label),
    policyCanon: true,
  },
  {
    name: "FAQ",
    texts: FAQ_ITEMS.flatMap((item) => [item.question, item.answer]),
    policyCanon: true,
  },
  {
    name: "category hubs (12 indexed landing pages)",
    texts: CATEGORY_HUBS.flatMap((hub) => [hub.title, hub.description]),
  },
  {
    // Machine-read by assistants, which then repeat these claims to users —
    // a false claim here escapes the site entirely.
    name: "llms.txt",
    texts: [source("public/llms.txt")],
  },
  {
    // Copy lives inline in the component rather than a data module, which is
    // exactly how its enforcement claim escaped this guard.
    name: "host pitch (/host)",
    texts: [source("components/host-pitch.tsx")],
  },
  {
    // The claim was printed HERE, on every listing detail page, and the first
    // cut of this very guard omitted this file — I fixed the surface and left
    // it unscanned, which is precisely the defect this guard exists to catch.
    // Reintroducing "No purchase necessary · See official rules" must fail.
    name: "listing detail (/sweeps/[slug])",
    texts: [source("components/listing-detail.tsx")],
  },
  // ⚠️ AND IT HAPPENED A SECOND TIME. Everything above scans `lib/`, `public/`
  // and `components/` — no `app/` route was ever looked at. So the six entries
  // above were the whole guard while SEVEN more claim surfaces shipped the
  // no-purchase assertion unscanned: the HOMEPAGE said it twice, and the
  // social OG CARD — the preview for every shared link, the one claim surface
  // that travels off the site entirely — put it on a trust chip. The nav rail
  // printed it on every page. Fixing a surface is not the fix; SCANNING it is.
  // A claim surface is any file that ships a user-visible string, not just the
  // ones that happen to be data modules or components.
  {
    // Said it twice: footer trust line + hero sub-CTA.
    name: "homepage (/)",
    texts: [source("app/page.tsx")],
  },
  {
    name: "category hub pages (/discover/[category])",
    texts: [source("app/discover/[category]/page.tsx")],
  },
  {
    // The page's own inline copy only — FAQ_ITEMS answers are policy canon and
    // are scanned as the "FAQ" surface above, which this file merely renders.
    name: "FAQ page (/faq)",
    texts: [source("app/faq/page.tsx")],
  },
  {
    name: "profile (/profile)",
    texts: [source("app/profile/page.tsx")],
  },
  {
    // Travels off-site into every social embed; nothing on the page corrects it.
    name: "social OG card (opengraph-image)",
    texts: [source("app/opengraph-image.tsx")],
  },
  {
    name: "about (/about)",
    texts: [source("app/about/page.tsx")],
  },
  {
    name: "host page (/host)",
    texts: [source("app/host/page.tsx")],
  },
  {
    // Persistent left nav — its copy renders on every route.
    name: "side rail (all routes)",
    texts: [source("components/side-rail.tsx")],
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
      // Policy canon may state Sweepza's own listing commitment; it may not be
      // held to the per-listing family, which exists to stop us asserting a
      // sponsor's legal representation for them.
      if (surface.policyCanon && family.name === "per-listing no-purchase claims") continue;
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
