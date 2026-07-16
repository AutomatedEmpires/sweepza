import "server-only";

import { sweepsAdvantageAdapter } from "@/lib/ingestion/adapters/sweeps-advantage";
import { extractOfficialPage } from "@/lib/ingestion/extract";
import { normalizeUrl } from "@/lib/ingestion/fingerprint";
import { mapExtraction } from "@/lib/ingestion/mapper";
import { snapshotOfficialRules } from "@/lib/ingestion/snapshot";
import { enabledSources, type SourceAdapter } from "@/lib/ingestion/source";
import { verifyCandidate } from "@/lib/ingestion/verify";
import {
  createIngestedListing,
  findExistingListingId,
  findIngestionByUrlKey,
  finishIngestionRun,
  recordProvenance,
  startIngestionRun,
  touchLastSeen,
  type IngestionRunCounts,
} from "@/lib/db/ingestion";

// The pipeline assembly: for each enabled source, discover leads → resolve
// official URL → skip if already known (idempotent) → extract at the source →
// map to canonical → dedupe → create a DRAFT (review-only) listing + snapshot +
// provenance. Everything an agent finds waits for a human; nothing auto-publishes.
//
// Sources ship disabled (source.ts), so this no-ops until one is turned on and
// its ToS is cleared. Callers (the cron) additionally require an extractor key.

const ADAPTERS: Record<string, SourceAdapter> = {
  sweeps_advantage: sweepsAdvantageAdapter,
};

export interface IngestionSourceSummary extends IngestionRunCounts {
  source: string;
  status: "ok" | "error";
}

export async function runIngestion(
  options: { limit?: number } = {},
): Promise<IngestionSourceSummary[]> {
  const limit = options.limit ?? 25;
  const summaries: IngestionSourceSummary[] = [];

  for (const source of enabledSources()) {
    const adapter = ADAPTERS[source.id];
    if (!adapter) continue;

    const runId = await startIngestionRun(source.id);
    const counts: Required<IngestionRunCounts> = {
      discovered: 0,
      fetched: 0,
      created: 0,
      updated: 0,
      skipped: 0,
      failed: 0,
    };

    try {
      const leads = await adapter.discover({ limit });
      counts.discovered = leads.length;

      const seenThisRun = new Set<string>();
      for (const lead of leads) {
        const urlKey = normalizeUrl(lead.officialUrl);
        if (!urlKey || seenThisRun.has(urlKey)) {
          counts.skipped += 1;
          continue;
        }
        seenThisRun.add(urlKey);

        // Idempotency: already in the catalog → refresh last_seen, don't re-fetch.
        const known = await findIngestionByUrlKey(urlKey);
        if (known) {
          await touchLastSeen(known.listingId);
          counts.skipped += 1;
          continue;
        }

        // Fetch + extract the official page (the source of truth).
        const extraction = await extractOfficialPage(lead.officialUrl).catch(() => null);
        counts.fetched += 1;
        if (!extraction) {
          counts.failed += 1;
          continue;
        }

        const { candidate } = mapExtraction(extraction.raw);
        // NOT NULL guardrail — without these the row can't be created; hold it.
        if (!candidate.title || !candidate.shortDescription || !candidate.prizeName) {
          counts.failed += 1;
          continue;
        }

        // Cross-source dedupe: same sweep already known under another link.
        const duplicateOf = await findExistingListingId(candidate.dedup);
        if (duplicateOf) {
          counts.skipped += 1;
          continue;
        }

        const verification = verifyCandidate(candidate);
        const listingId = await createIngestedListing(candidate);
        const snapshotRef = await snapshotOfficialRules(lead.officialUrl, extraction.pageText);
        await recordProvenance(listingId, {
          officialUrlKey: candidate.dedup.urlKey,
          contentFingerprint: candidate.dedup.contentKey,
          discoverySource: source.id,
          officialSourceUrl: urlKey,
          rawSnapshotRef: snapshotRef,
          extractionConfidence: verification.confidence,
          contentHash: extraction.contentHash,
        });
        counts.created += 1;
      }

      await finishIngestionRun(runId, counts, "ok");
      summaries.push({ source: source.id, status: "ok", ...counts });
    } catch (error) {
      await finishIngestionRun(
        runId,
        counts,
        "error",
        error instanceof Error ? error.message : String(error),
      );
      summaries.push({ source: source.id, status: "error", ...counts });
    }
  }

  return summaries;
}
