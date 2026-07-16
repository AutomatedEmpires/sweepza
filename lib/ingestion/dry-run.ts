import { dedupKeys, explainDuplicate } from "@/lib/ingestion/fingerprint";
import { mapExtraction, type RawExtraction } from "@/lib/ingestion/mapper";
import { verifyCandidate } from "@/lib/ingestion/verify";

// Dry-run ingestion — show exactly what a pass WOULD do, mutating nothing.
//
// The live pipeline discovers leads, fetches official pages, extracts them with
// the LLM, maps, verifies, dedupes, and writes draft listings. A dry run replays
// every stage EXCEPT the two that touch the outside world (the LLM call and the
// database write): it is handed the extractions a run would have produced and
// reports, per lead, what disposition it would reach and why. That makes the
// pipeline's judgment inspectable before anyone turns it on — the founder can
// see "this source would create 4, hold 3 for review, reject 2, and skip 1
// duplicate" without a single row being written or a single page being fetched.

export type DryRunDisposition =
  | "would_create"
  | "would_review"
  | "would_reject"
  | "would_skip_duplicate"
  | "would_skip_known";

export interface DryRunLeadInput {
  officialUrl: string;
  /** The extraction a live run's LLM step would have returned for this page. */
  extraction: RawExtraction;
}

export interface DryRunLeadResult {
  officialUrl: string;
  disposition: DryRunDisposition;
  title: string | null;
  /** Confidence 0..1 from verify.ts (soft evidence share). */
  confidence: number;
  /** Hard-gate failures that would hold the listing. */
  hardFailures: string[];
  /** Mapper issues + verifier summary — the "why" for a reviewer. */
  notes: string[];
  /** For a duplicate, the officialUrl it collides with. */
  duplicateOf?: string;
}

export interface DryRunReport {
  source: string;
  totals: {
    leads: number;
    wouldCreate: number;
    wouldReview: number;
    wouldReject: number;
    wouldSkipDuplicate: number;
    wouldSkipKnown: number;
  };
  results: DryRunLeadResult[];
  /** Always true — a dry run never writes. Stated so callers can assert it. */
  readOnly: true;
}

export interface DryRunOptions {
  /**
   * Official-URL keys already in the catalog. A lead matching one is reported as
   * `would_skip_known` (idempotency), exactly as the live orchestrator would.
   */
  knownUrlKeys?: Set<string>;
}

/**
 * Simulate the map → verify → dedupe → disposition stages for a batch of leads.
 * Pure: no network, no LLM, no database. Duplicate detection runs both against
 * the provided known-keys set (idempotency) and within the batch itself
 * (cross-source dedupe), using the same explainable signals the live pipeline
 * would apply.
 */
export function dryRunIngestion(
  source: string,
  leads: DryRunLeadInput[],
  options: DryRunOptions = {},
): DryRunReport {
  const known = options.knownUrlKeys ?? new Set<string>();
  const results: DryRunLeadResult[] = [];

  // Track what we've "created" this batch, to catch intra-batch duplicates the
  // same way the orchestrator's seenThisRun + findExistingListingId would.
  const acceptedThisRun: { officialUrl: string; input: Parameters<typeof dedupKeys>[0] }[] = [];

  for (const lead of leads) {
    const { candidate, issues } = mapExtraction(lead.extraction);
    const notes = [...issues];

    const keys = candidate.dedup;

    // Idempotency: already known under this official URL.
    if (keys.urlKey && known.has(keys.urlKey)) {
      results.push({
        officialUrl: lead.officialUrl,
        disposition: "would_skip_known",
        title: candidate.title || null,
        confidence: 0,
        hardFailures: [],
        notes: ["already in the catalog under this official URL — would refresh last_seen only"],
      });
      continue;
    }

    // Cross-source duplicate within this batch.
    const dupe = acceptedThisRun.find((prior) => {
      const explanation = explainDuplicate(prior.input, {
        officialRulesUrl: candidate.officialRulesUrl,
        entryUrl: candidate.entryUrl,
        sponsorName: lead.extraction.sponsorName,
        prizeName: candidate.prizeName,
        endDate: candidate.endDate,
        eligibilityCountry: candidate.eligibilityCountry,
      });
      return explanation.verdict === "identical" || explanation.verdict === "suspected";
    });
    if (dupe) {
      results.push({
        officialUrl: lead.officialUrl,
        disposition: "would_skip_duplicate",
        title: candidate.title || null,
        confidence: 0,
        hardFailures: [],
        notes: ["matches another lead in this batch — would hold as a suspected duplicate"],
        duplicateOf: dupe.officialUrl,
      });
      continue;
    }

    // NOT NULL guardrail the orchestrator applies before insert.
    if (!candidate.title || !candidate.shortDescription || !candidate.prizeName) {
      results.push({
        officialUrl: lead.officialUrl,
        disposition: "would_reject",
        title: candidate.title || null,
        confidence: 0,
        hardFailures: ["missing required field (title / short description / prize)"],
        notes,
      });
      continue;
    }

    const verification = verifyCandidate(candidate);
    notes.push(verification.summary);

    const disposition: DryRunDisposition = verification.publishable
      ? "would_create"
      : "would_review";

    results.push({
      officialUrl: lead.officialUrl,
      disposition,
      title: candidate.title,
      confidence: verification.confidence,
      hardFailures: verification.hardFailures,
      notes,
    });

    // A creatable/reviewable lead becomes a dedupe reference for the rest.
    acceptedThisRun.push({
      officialUrl: lead.officialUrl,
      input: {
        officialRulesUrl: candidate.officialRulesUrl,
        entryUrl: candidate.entryUrl,
        sponsorName: lead.extraction.sponsorName,
        prizeName: candidate.prizeName,
        endDate: candidate.endDate,
        eligibilityCountry: candidate.eligibilityCountry,
      },
    });
  }

  const totals = {
    leads: leads.length,
    wouldCreate: results.filter((r) => r.disposition === "would_create").length,
    wouldReview: results.filter((r) => r.disposition === "would_review").length,
    wouldReject: results.filter((r) => r.disposition === "would_reject").length,
    wouldSkipDuplicate: results.filter((r) => r.disposition === "would_skip_duplicate").length,
    wouldSkipKnown: results.filter((r) => r.disposition === "would_skip_known").length,
  };

  return { source, totals, results, readOnly: true };
}
