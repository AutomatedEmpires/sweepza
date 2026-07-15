import type { NormalizedCandidate } from "@/lib/ingestion/mapper";

// Auto-verification — the structural, network-free gate between extraction and
// the review queue. It answers two questions: is this candidate safe to
// publish at all (hard gates), and how confident are we (a score that decides
// auto-publish vs. human review). Live checks that need the network
// (does the URL resolve? is the domain known-bad?) belong to the cron, not here.

export interface VerifyResult {
  /** Named boolean checks, for display in the review queue. */
  checks: Record<string, boolean>;
  /** 0..1 — share of all checks passed, for ranking/auto-publish thresholds. */
  confidence: number;
  /** True only when every hard gate passes; false ⇒ never auto-publish. */
  publishable: boolean;
  /** Hard gates that failed — the reasons a candidate is held. */
  hardFailures: string[];
}

interface Check {
  id: string;
  hard: boolean;
  passed: (c: NormalizedCandidate, now: Date) => boolean;
}

// Hard gates encode the non-negotiables: enough to be a real listing, a
// resolvable official rules link, an affirmative no-purchase, and a live end
// date. The legal posture (never host a pay-to-enter sweep, always cite
// official rules) is enforced here, in data, not left to a reviewer's memory.
const CHECKS: Check[] = [
  { id: "has_title", hard: true, passed: (c) => c.title.length >= 5 },
  { id: "has_short_description", hard: true, passed: (c) => c.shortDescription.length >= 10 },
  { id: "has_prize_name", hard: true, passed: (c) => c.prizeName.length >= 3 },
  { id: "has_official_rules_url", hard: true, passed: (c) => Boolean(c.officialRulesUrl) },
  { id: "has_entry_url", hard: true, passed: (c) => Boolean(c.entryUrl) },
  { id: "no_purchase_necessary", hard: true, passed: (c) => c.noPurchaseNecessary === true },
  {
    id: "end_date_in_future",
    hard: true,
    passed: (c, now) => Boolean(c.endDate) && new Date(`${c.endDate}T23:59:59Z`).getTime() >= now.getTime(),
  },
  { id: "category_recognized", hard: false, passed: (c) => c.prizeCategory !== "other" },
  { id: "entry_frequency_recognized", hard: false, passed: (c) => c.entryFrequency !== "other" },
  { id: "has_prize_value", hard: false, passed: (c) => c.prizeValue != null && c.prizeValue > 0 },
  { id: "has_eligibility_country", hard: false, passed: (c) => Boolean(c.eligibilityCountry) },
  { id: "has_sponsor", hard: false, passed: (c) => Boolean(c.sponsorName) },
  { id: "has_image", hard: false, passed: (c) => Boolean(c.mainImageUrl) },
];

/**
 * Score a candidate against the structural checks. `publishable` gates
 * auto-publish (all hard checks); `confidence` (all checks) ranks and sets the
 * auto-publish threshold for trusted sources.
 */
export function verifyCandidate(
  candidate: NormalizedCandidate,
  now: Date = new Date(),
): VerifyResult {
  const checks: Record<string, boolean> = {};
  const hardFailures: string[] = [];
  let passedCount = 0;

  for (const check of CHECKS) {
    const ok = check.passed(candidate, now);
    checks[check.id] = ok;
    if (ok) passedCount += 1;
    else if (check.hard) hardFailures.push(check.id);
  }

  return {
    checks,
    confidence: Number((passedCount / CHECKS.length).toFixed(2)),
    publishable: hardFailures.length === 0,
    hardFailures,
  };
}
