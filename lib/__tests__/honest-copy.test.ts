import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CATEGORY_HUBS } from "@/lib/category-hubs";
import { FAQ_ITEMS } from "@/lib/faq";
import { TRUST_BAND_ITEMS } from "@/lib/trust-copy";

// Public trust copy must never claim more than the platform enforces.
//
// ⚠️ THIS GUARD EXISTED AND THE SITE LIED ANYWAY — TWICE, the same way both
// times: the detectors were right and the surface list was short.
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
// Round 3 (this one) is not another name on the list. Both misses had the same
// cause and it was structural: coverage was a MANUAL ENUMERATION, so a claim was
// caught only if an author remembered to come here. "Remember to edit SURFACES"
// is a process, and the process had already failed twice. The fix is to stop
// asking. `discoverAppClaimSources()` walks the `app` tree and every file it
// finds must be either scanned or listed in EXEMPT_APP_SOURCES with a written,
// VERIFIED reason — a new route fails this suite until somebody classifies it.
// Forgetting is now the loud case, which is the only property that makes this
// stop recurring.
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

// Named so the per-surface exceptions below cannot drift away from the family
// they exempt (a typo'd string literal would silently exempt nothing, or worse,
// silently exempt everything if the comparison were ever inverted).
const PER_LISTING_NO_PURCHASE = "per-listing no-purchase claims";
const GUARANTEES = "guarantees";

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
    name: PER_LISTING_NO_PURCHASE,
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
      // Word-order hole, found on review of round 2: the bare pattern above
      // matches only "no purchase necessary", so /faq's header sentence ("no
      // purchase is ever necessary") sailed past a surface that had just been
      // added to catch exactly that claim. The old pattern here additionally
      // required a following any/each/every, so "no purchase is ever necessary
      // to enter this sweepstakes" would also have escaped. Drop the trailing
      // requirement: this phrasing is an assertion however the sentence ends.
      // Verified safe for llms.txt, which negates in a different word order
      // ("requires no purchase", "no purchase is necessary") and never says
      // "ever". This pattern is what now keeps /faq honest: the page header was
      // rewritten to be true unscoped rather than exempted, so this fires there
      // if the claim ever comes back. The only file that may still say it is
      // lib/faq.ts, which scopes it to "the sweepstakes we list" — a policy
      // statement, not a certification.
      /no purchase is ever necessary/i,
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
      // The /faq header phrasing the round-2 detector missed, and the
      // open-ended variant the any/each/every requirement let through.
      "No purchase is ever necessary to enter this sweepstakes",
      "Sweepza is free, no purchase is ever necessary, and we're a directory",
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
    name: GUARANTEES,
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
 * Read a public claim surface that is not a data module (route / component /
 * static file), with comments stripped.
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

// ---------------------------------------------------------------------------
// Completeness: the `app` tree decides what needs classifying, not an author's
// memory. In the app router a file's path IS its public URL, so "which files
// can put a claim in front of a user" is a filesystem question with an exact
// answer — which is why this half is derived and the rest of this file is not.
//
// `route.tsx` is included deliberately: a route handler that renders JSX is an
// image/HTML response, i.e. pixels with words on them (app/api/og/... is the
// per-listing social card). Plain `route.ts` handlers return JSON to code and
// are not claim surfaces. Filename-based, no glob dependency.
// ---------------------------------------------------------------------------
const APP_DIR = "app";

const CLAIM_SOURCE_FILENAMES = new Set([
  "page.tsx",
  "layout.tsx",
  "template.tsx",
  "default.tsx",
  "loading.tsx",
  "error.tsx",
  "global-error.tsx",
  "not-found.tsx",
  "opengraph-image.tsx",
  "twitter-image.tsx",
  "route.tsx",
]);

function discoverAppClaimSources(dir: string = APP_DIR, out: string[] = []): string[] {
  for (const entry of readdirSync(join(process.cwd(), dir), { withFileTypes: true })) {
    const relativePath = `${dir}/${entry.name}`;
    if (entry.isDirectory()) {
      if (entry.name === "__tests__") continue;
      discoverAppClaimSources(relativePath, out);
    } else if (CLAIM_SOURCE_FILENAMES.has(entry.name)) {
      out.push(relativePath);
    }
  }
  return out.sort();
}

// Routes that are deliberately NOT scanned. Every reason here names a mechanism
// that was READ AND VERIFIED, not assumed — an exemption justified by a guess is
// the same unbacked assertion this file exists to ban, just in a comment.
const EXEMPT_APP_SOURCES: Record<string, string> = {
  // ADMIN — never rendered to the public. VERIFIED in app/admin/layout.tsx:
  // it returns an <AdminGateNotice/> *instead of* {children} unless
  // isClerkConfigured() AND ensureCurrentAppUser() resolves a user AND that
  // user has is_admin || is_owner. app/robots.ts also disallows /admin.
  // Internal operational copy is not a public claim, and holding an ops console
  // to marketing-grade claim rules would eventually pressure someone into
  // weakening a detector to ship an admin string.
  //
  // NOTE: app/admin/layout.tsx itself is NOT exempt — the gate notice is what a
  // signed-out visitor to /admin actually sees, so it is public copy and it is
  // scanned below. The gate cannot exempt the gate.
  "app/admin/page.tsx": "admin-only: behind the app/admin/layout.tsx role gate",
  "app/admin/claims/page.tsx": "admin-only: behind the app/admin/layout.tsx role gate",
  "app/admin/hosts/page.tsx": "admin-only: behind the app/admin/layout.tsx role gate",
  "app/admin/import/page.tsx": "admin-only: behind the app/admin/layout.tsx role gate",
  "app/admin/listings/page.tsx": "admin-only: behind the app/admin/layout.tsx role gate",
  "app/admin/notifications/page.tsx": "admin-only: behind the app/admin/layout.tsx role gate",
  "app/admin/reports/page.tsx": "admin-only: behind the app/admin/layout.tsx role gate",
  "app/admin/review/page.tsx": "admin-only: behind the app/admin/layout.tsx role gate",
  "app/admin/winners/page.tsx": "admin-only: behind the app/admin/layout.tsx role gate",

  // VISUAL REVIEW — design-system fixtures that render FAKE listings. Not
  // reachable in production, VERIFIED three ways in each file: an early
  // `notFound()` when VERCEL_ENV === "production", `robots: { index: false }`
  // in its exported metadata, and a /visual-review disallow in app/robots.ts.
  // These pages render real components against fixture data, so scanning them
  // would double-scan components/listing-detail.tsx (already a surface) while
  // holding lib/fixtures copy to the public contract.
  "app/visual-review/page.tsx":
    "dev/preview-only: notFound() when VERCEL_ENV==='production' + noindex + robots.ts disallow",
  "app/visual-review/detail/page.tsx":
    "dev/preview-only: notFound() when VERCEL_ENV==='production' + noindex + robots.ts disallow",
  "app/visual-review/not-found/page.tsx":
    "dev/preview-only: notFound() when VERCEL_ENV==='production' + noindex + robots.ts disallow",
};

interface Surface {
  name: string;
  /** Files this surface reads. Drives completeness + the anti-rot check. */
  sources?: string[];
  texts: string[];
  /**
   * States Sweepza's OWN listing policy (an editorial commitment with a
   * reporting path) rather than a fact about a third party's promotion. Skips
   * only the per-listing no-purchase family; every other family still applies.
   *
   * ⚠️ This is per-FILE, not per-sentence, so it only belongs on a surface whose
   * every claim is scoped policy — i.e. the curated data modules (lib/faq.ts,
   * lib/trust-copy.ts), where the founder writes each string deliberately and
   * scopes it ("…on the sweepstakes we list"). It does NOT belong on a route
   * that renders free-text prose: setting it there to bless one sentence
   * switches the family off for the whole file, and a live unsupported claim
   * elsewhere on the page then ships green. That was tried on app/faq/page.tsx
   * and rejected — fix the sentence, do not exempt the file.
   */
  policyCanon?: boolean;
  /**
   * Counsel-owned legal page. Skips only the guarantees family: a disclaimer
   * has to name the thing it disclaims, so /privacy ("no online service can
   * guarantee absolute security") and /terms ("is not a guarantee that a
   * promotion is available…") trip a bare /guarantee/i while SAYING what that
   * family exists to enforce. Both occurrences were read and are negations —
   * this is not a blanket pass, every other family still applies.
   */
  legalCanon?: boolean;
}

/** One app-router file, scanned whole. Name = path so failures are greppable. */
function routeSurface(
  path: string,
  options: Omit<Surface, "name" | "sources" | "texts"> = {},
): Surface {
  return { name: path, sources: [path], texts: [source(path)], ...options };
}

// Every app-router claim source that is not exempt above. The completeness test
// asserts this list plus EXEMPT_APP_SOURCES accounts for the whole tree, so a
// new route cannot arrive unscanned and green.
const APP_ROUTE_SURFACES: Surface[] = [
  // Shipped the no-purchase claim twice (footer trust line + hero sub-CTA).
  routeSurface("app/page.tsx"),
  // Travels off-site into every social embed; nothing on the page corrects it.
  routeSurface("app/opengraph-image.tsx"),
  routeSurface("app/layout.tsx"),
  routeSurface("app/loading.tsx"),
  routeSurface("app/error.tsx"),
  routeSurface("app/global-error.tsx"),
  routeSurface("app/not-found.tsx"),
  routeSurface("app/about/page.tsx"),
  routeSurface("app/cookies/page.tsx"),
  // /faq is scanned by every family, INCLUDING the per-listing no-purchase one.
  //
  // A route-wide `policyCanon: true` was tried here and REJECTED. The argument
  // for it was that /faq paraphrases lib/faq.ts, which is already canon, so
  // exempting the module while holding its own paraphrase to the per-listing
  // rule was incoherent. The argument is real; the conclusion was backwards.
  // The incoherence was answerable by fixing the paraphrase, and the module's
  // phrasing does work the header's did not: lib/faq.ts SCOPES the claim ("no
  // purchase is ever necessary ON THE SWEEPSTAKES WE LIST" — an editorial
  // policy, with a reporting path). The header said "Sweepza is free, no
  // purchase is ever necessary, and we're a directory": three coordinate
  // facts, the middle one of which a reader takes as certification of a
  // sponsor's promotion. Same words, different act.
  //
  // And the mechanics were worse than the wording. `policyCanon` is per-FILE,
  // not per-sentence, so exempting the route to bless one header sentence
  // switched the family off for the whole page — leaving a live unsupported
  // claim while this suite went green. Exempting a surface to pass is this
  // file's own failure mode; rounds 1 and 2 were both green for exactly that
  // reason. A guard cannot be the thing it bans.
  //
  // So the header was rewritten to be true unscoped (see app/faq/page.tsx),
  // and this route stays honest by passing, not by exemption. lib/faq.ts and
  // lib/trust-copy.ts keep `policyCanon` — those ARE the founder's scoped
  // canon. FOUNDER-OWNED LINE: stating Sweepza's own listing policy is
  // legitimate; certifying a specific sponsor's promotion is not. A route that
  // renders free-text prose is the wrong granularity to draw it at.
  routeSurface("app/faq/page.tsx"),
  // Legal canon — see `legalCanon` above. Read, verified negated.
  routeSurface("app/privacy/page.tsx", { legalCanon: true }),
  routeSurface("app/terms/page.tsx", { legalCanon: true }),
  routeSurface("app/discover/page.tsx"),
  routeSurface("app/discover/[category]/page.tsx"),
  routeSurface("app/discover/swipe/page.tsx"),
  routeSurface("app/listings/page.tsx"),
  routeSurface("app/search/page.tsx"),
  routeSurface("app/saved/page.tsx"),
  routeSurface("app/my-sweeps/page.tsx"),
  routeSurface("app/winners/page.tsx"),
  routeSurface("app/winners/new/page.tsx"),
  routeSurface("app/sweeps/[slug]/page.tsx"),
  routeSurface("app/sweeps/[slug]/loading.tsx"),
  routeSurface("app/sweeps/[slug]/not-found.tsx"),
  // The per-listing social card: an ImageResponse, so its words leave the site
  // exactly like app/opengraph-image.tsx did.
  routeSurface("app/api/og/sweeps/[slug]/route.tsx"),
  routeSurface("app/profile/page.tsx"),
  routeSurface("app/profile/notifications/page.tsx"),
  routeSurface("app/sign-in/[[...sign-in]]/page.tsx"),
  routeSurface("app/sign-up/[[...sign-up]]/page.tsx"),
  // Host surfaces. /host is the public pitch; the dashboards below sit behind
  // sign-in but are scanned anyway — scanning costs nothing and needs no
  // justification, whereas exempting them would need a verified gate mechanism
  // and would buy nothing.
  routeSurface("app/host/page.tsx"),
  routeSurface("app/host/listings/page.tsx"),
  routeSurface("app/host/listings/[listingId]/edit/page.tsx"),
  routeSurface("app/host/analytics/page.tsx"),
  routeSurface("app/host/billing/page.tsx"),
  routeSurface("app/host/notifications/page.tsx"),
  routeSurface("app/host/settings/page.tsx"),
  // Public copy despite living under /admin: this is the "sign in required" /
  // "403" notice an unauthenticated visitor sees. See EXEMPT_APP_SOURCES.
  routeSurface("app/admin/layout.tsx"),
];

// Data modules, components and static files. These stay ENUMERATED, and that is
// a deliberate limit rather than an oversight:
//
// `app` is derivable because a path there IS a URL — the filesystem answers
// "is this public?" exactly. `components/` has no such property. A component
// ships nothing until something imports it, and whether it reaches the public
// depends on the import graph, so the only honest exemption reason for a
// component would be "not rendered on a public route" — a claim I could not
// VERIFY without import-graph analysis, and writing exemption reasons I cannot
// verify is the exact failure this guard punishes. Scanning all ~40 instead
// (no exemptions, nothing to verify) fails differently: components/
// my-sweeps-dashboard.tsx honestly says entries "ending within 3 days", which
// the review-timing family reads as an SLA promise. That false positive would
// have to be silenced by weakening a detector — the one move that is never
// allowed here.
//
// So: enumerated, with the round-1/round-2 misses (llms.txt, category hubs,
// host pitch, listing detail, side rail) all present. If a future component
// miss happens, the answer is to derive reachability from the import graph, not
// to add another name and another promise to remember.
const OTHER_SURFACES: Surface[] = [
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
    sources: ["public/llms.txt"],
    texts: [source("public/llms.txt")],
  },
  {
    // Copy lives inline in the component rather than a data module, which is
    // exactly how its enforcement claim escaped this guard.
    name: "host pitch (/host)",
    sources: ["components/host-pitch.tsx"],
    texts: [source("components/host-pitch.tsx")],
  },
  {
    // The claim was printed HERE, on every listing detail page, and the first
    // cut of this very guard omitted this file — I fixed the surface and left
    // it unscanned, which is precisely the defect this guard exists to catch.
    // Reintroducing "No purchase necessary · See official rules" must fail.
    name: "listing detail (/sweeps/[slug])",
    sources: ["components/listing-detail.tsx"],
    texts: [source("components/listing-detail.tsx")],
  },
  {
    // Persistent left nav — its copy renders on every route, which is how one
    // string became a claim on every page of the site.
    name: "side rail (all routes)",
    sources: ["components/side-rail.tsx"],
    texts: [source("components/side-rail.tsx")],
  },
];

const SURFACES: Surface[] = [...OTHER_SURFACES, ...APP_ROUTE_SURFACES];

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

// The test that makes forgetting impossible. Rounds 1 and 2 both shipped a lie
// because a claim surface existed that nobody had listed here; this fails the
// moment that is true again, instead of two reviews later.
describe("app-router claim-surface completeness", () => {
  const discovered = discoverAppClaimSources();
  const scanned = new Set(SURFACES.flatMap((surface) => surface.sources ?? []));
  const exempt = new Set(Object.keys(EXEMPT_APP_SOURCES));

  it("finds the app tree at all", () => {
    // A discovery walk that silently returns [] would make every assertion
    // below vacuously true — the failure mode of a guard that guards nothing.
    expect(discovered.length).toBeGreaterThan(20);
    expect(discovered).toContain("app/page.tsx");
  });

  it("classifies every app-router claim source as scanned or exempt", () => {
    const unclassified = discovered.filter(
      (path) => !scanned.has(path) && !exempt.has(path),
    );
    expect(
      unclassified,
      `Unclassified app-router claim source(s):\n  ${unclassified.join("\n  ")}\n\n` +
        "Every file that can put words in front of a user must be accounted for.\n" +
        "Either add routeSurface(\"<path>\") to APP_ROUTE_SURFACES so its copy is\n" +
        "checked, or add it to EXEMPT_APP_SOURCES with a reason naming a mechanism\n" +
        "you have READ AND VERIFIED (e.g. an auth gate, a production notFound()).\n" +
        "Do not exempt a route to make this pass.",
    ).toEqual([]);
  });

  it("keeps every classified path pointing at a file that exists", () => {
    // Without this, SURFACES and EXEMPT_APP_SOURCES rot into fiction: a renamed
    // route leaves behind an entry that reassures a reader while scanning
    // nothing. (Scanned paths would also throw in source(); exempt paths are
    // never read, so nothing else would ever notice.)
    const missing = [...scanned, ...exempt].filter(
      (path) => !existsSync(join(process.cwd(), path)),
    );
    expect(
      missing,
      `Classified path(s) that no longer exist:\n  ${missing.join("\n  ")}\n\n` +
        "Remove or repoint the stale entry — a list that names dead files is a\n" +
        "coverage claim with nothing behind it.",
    ).toEqual([]);
  });

  it("exempts nothing without a written reason", () => {
    for (const [path, reason] of Object.entries(EXEMPT_APP_SOURCES)) {
      expect(reason.trim().length, `${path} needs a real reason`).toBeGreaterThan(20);
    }
  });

  it("never both scans and exempts the same path", () => {
    const both = [...exempt].filter((path) => scanned.has(path));
    expect(both, `scanned AND exempt (the exemption would read as coverage)`).toEqual([]);
  });
});

describe("honest trust copy", () => {
  for (const surface of SURFACES) {
    for (const family of BANNED_FAMILIES) {
      // Policy canon may state Sweepza's own listing commitment; it may not be
      // held to the per-listing family, which exists to stop us asserting a
      // sponsor's legal representation for them.
      if (surface.policyCanon && family.name === PER_LISTING_NO_PURCHASE) continue;
      // Legal canon must be able to disclaim a guarantee by naming it.
      if (surface.legalCanon && family.name === GUARANTEES) continue;
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
