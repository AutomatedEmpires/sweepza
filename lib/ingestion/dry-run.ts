import { dedupKeys, explainDuplicate, type DedupKeys } from "@/lib/ingestion/fingerprint";
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
// see exactly which private drafts, suspected pairs, no-write holds, and
// idempotent returns would result without a single row being written or page
// being fetched.

export type DryRunDisposition =
  | "would_create_private_draft"
  | "would_create_suspected_pair"
  | "would_hold_no_write"
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
  /** Confidence 0..1 from verify.ts, or null when verification was not run. */
  confidence: number | null;
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
    wouldCreatePrivateDraft: number;
    wouldCreateSuspectedPair: number;
    wouldHoldNoWrite: number;
    wouldSkipKnown: number;
  };
  results: DryRunLeadResult[];
  /** Always true — a dry run never writes. Stated so callers can assert it. */
  readOnly: true;
}

export interface DryRunOptions {
  /**
   * Atomic URL+variant identities already in the catalog. URL alone is not an
   * identity because sponsors legitimately reuse a page for later cycles or
   * regional variants.
   */
  knownIdentityKeys?: Set<string>;
}

/** Mirrors the database uniqueness claim: normalized URL plus cycle/region. */
export function dryRunIdentityKey(keys: DedupKeys): string | null {
  return keys.urlKey ? `${keys.urlKey}|${keys.variantKey}` : null;
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
  const known = new Set(options.knownIdentityKeys ?? []);
  const results: DryRunLeadResult[] = [];

  // Track what this simulation created so later candidates reproduce the
  // database's atomic identity and suspected-pair outcomes within the batch.
  const acceptedThisRun: { officialUrl: string; input: Parameters<typeof dedupKeys>[0] }[] = [];

  for (const lead of leads) {
    const { candidate, issues } = mapExtraction(lead.extraction);
    const notes = [...issues];

    const keys = candidate.dedup;

    const identityKey = dryRunIdentityKey(keys);

    // Production verifies the newly extracted body before it asks the database
    // to claim identity. A stale/malformed revisit must therefore remain a
    // no-write hold even when its URL+variant already exists.
    const verification = verifyCandidate(candidate);
    notes.push(verification.summary);

    if (!verification.publishable) {
      results.push({
        officialUrl: lead.officialUrl,
        disposition: "would_hold_no_write",
        title: candidate.title || null,
        confidence: verification.confidence,
        hardFailures: verification.hardFailures,
        notes: [...notes, "live ingestion would record these failures in run notes and would not create a listing row"],
      });
      continue;
    }

    // Idempotency: only the exact URL+variant claim is already known.
    if (identityKey && known.has(identityKey)) {
      results.push({
        officialUrl: lead.officialUrl,
        disposition: "would_skip_known",
        title: candidate.title || null,
        confidence: verification.confidence,
        hardFailures: [],
        notes: ["same URL and cycle/region variant already exists — atomic create would return the existing private draft"],
      });
      continue;
    }

    // Exact URL+variant identity within this batch is idempotent. Content-only
    // similarity is handled after verification: live ingestion still creates a
    // separate private draft and records a suspected-pair review edge.
    const dupe = acceptedThisRun.find((prior) => {
      const explanation = explainDuplicate(prior.input, {
        officialRulesUrl: candidate.officialRulesUrl,
        entryUrl: candidate.entryUrl,
        sponsorName: lead.extraction.sponsorName,
        prizeName: candidate.prizeName,
        endDate: candidate.endDate,
        eligibilityCountry: candidate.eligibilityCountry,
        eligibilityStates: candidate.eligibilityStates,
      });
      return explanation.verdict === "identical";
    });
    if (dupe) {
      results.push({
        officialUrl: lead.officialUrl,
        disposition: "would_skip_known",
        title: candidate.title || null,
        confidence: verification.confidence,
        hardFailures: [],
        notes: ["same URL and cycle/region variant already claimed in this batch — atomic create would return the existing private draft"],
        duplicateOf: dupe.officialUrl,
      });
      continue;
    }

    const suspected = acceptedThisRun.find((prior) => {
      const explanation = explainDuplicate(prior.input, {
        officialRulesUrl: candidate.officialRulesUrl,
        entryUrl: candidate.entryUrl,
        sponsorName: lead.extraction.sponsorName,
        prizeName: candidate.prizeName,
        endDate: candidate.endDate,
        eligibilityCountry: candidate.eligibilityCountry,
        eligibilityStates: candidate.eligibilityStates,
      });
      return explanation.verdict === "suspected";
    });

    const disposition: DryRunDisposition = suspected
      ? "would_create_suspected_pair"
      : "would_create_private_draft";
    if (suspected) {
      notes.push("content similarity would create a separate private draft plus a suspected-duplicate review pair");
    }

    results.push({
      officialUrl: lead.officialUrl,
      disposition,
      title: candidate.title,
      confidence: verification.confidence,
      hardFailures: verification.hardFailures,
      notes,
      ...(suspected ? { duplicateOf: suspected.officialUrl } : {}),
    });

    // A created private draft becomes an identity/dedup reference for the rest.
    acceptedThisRun.push({
      officialUrl: lead.officialUrl,
      input: {
        officialRulesUrl: candidate.officialRulesUrl,
        entryUrl: candidate.entryUrl,
        sponsorName: lead.extraction.sponsorName,
        prizeName: candidate.prizeName,
        endDate: candidate.endDate,
        eligibilityCountry: candidate.eligibilityCountry,
        eligibilityStates: candidate.eligibilityStates,
      },
    });
    if (identityKey) known.add(identityKey);
  }

  const totals = {
    leads: leads.length,
    wouldCreatePrivateDraft: results.filter((r) => r.disposition === "would_create_private_draft").length,
    wouldCreateSuspectedPair: results.filter((r) => r.disposition === "would_create_suspected_pair").length,
    wouldHoldNoWrite: results.filter((r) => r.disposition === "would_hold_no_write").length,
    wouldSkipKnown: results.filter((r) => r.disposition === "would_skip_known").length,
  };

  return { source, totals, results, readOnly: true };
}
