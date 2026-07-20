import type { NormalizedCandidate } from "@/lib/ingestion/mapper";
import { assessExpiration } from "@/lib/ingestion/lifecycle";

// Auto-verification — the structural, network-free gate between extraction and
// the review queue. It answers two questions: is this candidate safe to
// publish at all (hard gates), and how much evidence do we actually have (a
// score that ranks review). Live checks that need the network (does the URL
// resolve? is the domain known-bad?) belong to the pipeline, not here.
//
// The score is deliberately EXPLAINED rather than merely reported. A bare 0.62
// tells a reviewer nothing and tempts everyone to treat it as a truth value; a
// list of which evidence was found, which was missing, and how much each
// mattered is something a human can actually check. Confidence here means
// "how completely did the official page state this", never "how likely is this
// sweepstakes to be real".

export type FactorId =
  | "has_title"
  | "has_short_description"
  | "has_prize_name"
  | "has_official_rules_url"
  | "has_entry_url"
  | "no_purchase_necessary"
  | "end_date_in_future"
  | "category_recognized"
  | "entry_frequency_recognized"
  | "has_prize_value"
  | "has_eligibility_country"
  | "has_age_requirement"
  | "has_sponsor"
  | "has_image"
  | "entry_and_rules_same_domain";

export interface EvidenceFactor {
  id: FactorId;
  /** Weight in the confidence score. Hard gates are excluded from scoring. */
  weight: number;
  hard: boolean;
  passed: boolean;
  /** Reviewer-facing sentence explaining what was or wasn't found. */
  explanation: string;
}

export interface VerifyResult {
  /** Named boolean checks, for display in the review queue. */
  checks: Record<string, boolean>;
  /** Weighted 0..1 over the soft evidence factors. */
  confidence: number;
  /** Every factor with its outcome and reason — the reviewable substance. */
  factors: EvidenceFactor[];
  /** True only when every hard gate passes; false ⇒ never auto-publish. */
  publishable: boolean;
  /** Hard gates that failed — the reasons a candidate is held. */
  hardFailures: string[];
  /** Short reviewer summary of what is missing. */
  summary: string;
}

interface Check {
  id: FactorId;
  hard: boolean;
  /** Soft-factor weight; hard gates are pass/fail, never scored. */
  weight: number;
  passed: (c: NormalizedCandidate, now: Date) => boolean;
  pass: string;
  fail: string;
}

/** Hosts compared without the www. prefix, matching normalizeUrl's identity. */
function hostOf(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

// Hard gates encode the non-negotiables: enough to be a real listing, a
// resolvable official rules link, an affirmative no-purchase, and a live end
// date. The legal posture (never host a pay-to-enter sweep, always cite
// official rules) is enforced here, in data, not left to a reviewer's memory.
//
// Soft weights reflect how much each fact matters to a SEEKER deciding whether
// to spend attention on a sweep — eligibility and frequency change whether they
// can enter at all, so they outweigh cosmetics like an image.
const CHECKS: Check[] = [
  {
    id: "has_title", hard: true, weight: 0,
    passed: (c) => c.title.length >= 5,
    pass: "Title present.",
    fail: "No usable title was extracted from the official page.",
  },
  {
    id: "has_short_description", hard: true, weight: 0,
    passed: (c) => c.shortDescription.length >= 10,
    pass: "Short description present.",
    fail: "No usable short description was extracted.",
  },
  {
    id: "has_prize_name", hard: true, weight: 0,
    passed: (c) => c.prizeName.length >= 3,
    pass: "Prize named on the page.",
    fail: "The page did not state a prize.",
  },
  {
    id: "has_official_rules_url", hard: true, weight: 0,
    passed: (c) => Boolean(c.officialRulesUrl),
    pass: "Official rules URL found.",
    fail: "No official rules URL — Sweepza never publishes a sweep it cannot cite.",
  },
  {
    id: "has_entry_url", hard: true, weight: 0,
    passed: (c) => Boolean(c.entryUrl),
    pass: "Entry URL found.",
    fail: "No entry URL — there is nowhere to send a seeker.",
  },
  {
    id: "no_purchase_necessary", hard: true, weight: 0,
    passed: (c) => c.noPurchaseNecessary === true,
    pass: "Page affirms no purchase is necessary.",
    fail: "The page does not affirm 'no purchase necessary'. Held: Sweepza does not list pay-to-enter sweeps.",
  },
  {
    id: "end_date_in_future", hard: true, weight: 0,
    passed: (c, now) => {
      const state = assessExpiration(c.endDate, now).state;
      return state !== "unknown" && state !== "expired";
    },
    pass: "End date is in the future.",
    fail: "The end date is missing or already past.",
  },
  {
    id: "has_eligibility_country", hard: false, weight: 3,
    passed: (c) => Boolean(c.eligibilityCountry),
    pass: "Eligibility country stated.",
    fail: "The page did not state an eligibility country — seekers cannot tell if they qualify.",
  },
  {
    id: "entry_frequency_recognized", hard: false, weight: 3,
    passed: (c) => c.entryFrequency !== "other",
    pass: "Entry frequency stated and recognized.",
    fail: "Entry frequency was not stated or did not map to a known value — re-entry reminders will be suppressed.",
  },
  {
    id: "has_sponsor", hard: false, weight: 3,
    passed: (c) => Boolean(c.sponsorName),
    pass: "Sponsor identified.",
    fail: "No sponsor was identified on the page.",
  },
  {
    id: "has_age_requirement", hard: false, weight: 2,
    passed: (c) => c.ageRequirement != null && c.ageRequirement > 0,
    pass: "Minimum age stated.",
    fail: "No minimum age was stated.",
  },
  {
    id: "entry_and_rules_same_domain", hard: false, weight: 2,
    passed: (c) => {
      const entry = hostOf(c.entryUrl);
      const rules = hostOf(c.officialRulesUrl);
      // Unknowable without both; scored as not-passed so a missing link never
      // silently earns credit.
      if (!entry || !rules) return false;
      return entry === rules;
    },
    pass: "Entry and official rules live on the same domain.",
    fail: "Entry and official rules are on different domains (or one is missing) — worth a look before publishing.",
  },
  {
    id: "category_recognized", hard: false, weight: 1,
    passed: (c) => c.prizeCategory !== "other",
    pass: "Prize category recognized.",
    fail: "Prize category did not map to a known category.",
  },
  {
    id: "has_prize_value", hard: false, weight: 1,
    passed: (c) => c.prizeValue != null && c.prizeValue > 0,
    pass: "Prize value stated.",
    fail: "No prize value was stated.",
  },
  {
    id: "has_image", hard: false, weight: 1,
    passed: (c) => Boolean(c.mainImageUrl),
    pass: "Image found.",
    fail: "No image was found on the page.",
  },
];

/**
 * Score a candidate against the structural evidence. `publishable` gates
 * auto-publish (all hard checks); `confidence` is the weighted share of soft
 * evidence present, and `factors` explains every input to it.
 */
export function verifyCandidate(
  candidate: NormalizedCandidate,
  now: Date = new Date(),
): VerifyResult {
  const checks: Record<string, boolean> = {};
  const hardFailures: string[] = [];
  const factors: EvidenceFactor[] = [];

  let earned = 0;
  let available = 0;

  for (const check of CHECKS) {
    const passed = check.passed(candidate, now);
    checks[check.id] = passed;
    factors.push({
      id: check.id,
      weight: check.weight,
      hard: check.hard,
      passed,
      explanation: passed ? check.pass : check.fail,
    });

    if (check.hard) {
      if (!passed) hardFailures.push(check.id);
      continue;
    }
    available += check.weight;
    if (passed) earned += check.weight;
  }

  const confidence = available === 0 ? 0 : Number((earned / available).toFixed(2));

  const missing = factors.filter((f) => !f.passed);
  const summary = missing.length === 0
    ? "Every structural check passed."
    : `${missing.length} of ${factors.length} checks did not pass: ${missing.map((f) => f.id).join(", ")}.`;

  return {
    checks,
    confidence,
    factors,
    publishable: hardFailures.length === 0,
    hardFailures,
    summary,
  };
}
