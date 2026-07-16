import "server-only";

import { env } from "@/lib/env";
import { freebieGuyAdapter } from "@/lib/ingestion/adapters/freebie-guy";
import { sweepsAdvantageAdapter } from "@/lib/ingestion/adapters/sweeps-advantage";
import { sweepstakesTodayAdapter } from "@/lib/ingestion/adapters/sweepstakes-today";
import { extractOfficialPage } from "@/lib/ingestion/extract";
import { normalizeUrl } from "@/lib/ingestion/fingerprint";
import { evaluateSourceGate, describeGateDecision } from "@/lib/ingestion/gate";
import { createSourceHttpClient } from "@/lib/ingestion/http";
import { mapExtraction } from "@/lib/ingestion/mapper";
import { snapshotOfficialRules } from "@/lib/ingestion/snapshot";
import { SOURCE_REGISTRY, getSourceDescriptor, type SourceAdapter } from "@/lib/ingestion/source";
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
import { getSourceRecord, recordRunOutcome } from "@/lib/db/source-registry";

// The pipeline assembly: for each source, ASK THE GATE → discover leads →
// resolve official URL → skip if already known (idempotent) → extract at the
// source → map to canonical → dedupe → create a DRAFT (review-only) listing +
// snapshot + provenance. Everything an agent finds waits for a human; nothing
// auto-publishes.
//
// The gate is checked per source, inside the loop, immediately before any
// network client exists for it. That ordering is the safety property: there is
// no code path from "runIngestion was called" to "a request was made" that does
// not pass through evaluateSourceGate first, and a refusal is RECORDED (status
// 'skipped' with the reason) rather than silently returning nothing.

const ADAPTERS: Record<string, SourceAdapter> = {
  sweeps_advantage: sweepsAdvantageAdapter,
  sweepstakes_today: sweepstakesTodayAdapter,
  freebie_guy: freebieGuyAdapter,
};

export interface IngestionSourceSummary extends IngestionRunCounts {
  source: string;
  status: "ok" | "error" | "skipped";
  /** Present whenever the gate refused the source. */
  gate?: string;
}

/** Official pages are fetched under their own policy, not the discoverer's. */
function officialPageDescriptor() {
  const descriptor = getSourceDescriptor("official_direct");
  if (!descriptor) throw new Error("official_direct descriptor is missing from SOURCE_REGISTRY");
  return descriptor;
}

export async function runIngestion(
  options: { limit?: number } = {},
): Promise<IngestionSourceSummary[]> {
  const limit = options.limit ?? 25;
  const summaries: IngestionSourceSummary[] = [];

  for (const descriptor of SOURCE_REGISTRY) {
    const adapter = ADAPTERS[descriptor.id];
    if (!adapter) continue;

    // Fail closed, before anything else exists. A source with no approval
    // record, a paused record, an open circuit, or a deployment-wide
    // INGESTION_ENABLED that isn't "true" stops here.
    const record = await getSourceRecord(descriptor.id).catch(() => null);
    const decision = evaluateSourceGate({
      descriptor,
      record,
      ingestionEnabled: env.INGESTION_ENABLED,
    });

    if (!decision.allowed) {
      const gate = describeGateDecision(decision);
      const runId = await startIngestionRun(descriptor.id);
      await finishIngestionRun(runId, {}, "skipped", gate, { gateDecision: gate });
      summaries.push({ source: descriptor.id, status: "skipped", gate });
      continue;
    }

    const runId = await startIngestionRun(descriptor.id);
    const counts: Required<IngestionRunCounts> = {
      discovered: 0, fetched: 0, created: 0, updated: 0, skipped: 0, failed: 0,
    };

    const http = createSourceHttpClient(descriptor);
    const officialHttp = createSourceHttpClient(officialPageDescriptor());

    try {
      const leads = await adapter.discover({ http, limit });
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
        const extraction = await extractOfficialPage(lead.officialUrl, { http: officialHttp })
          .catch(() => null);
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
          discoverySource: descriptor.id,
          officialSourceUrl: urlKey,
          rawSnapshotRef: snapshotRef,
          extractionConfidence: verification.confidence,
          extractionFactors: verification.factors,
          extractionSummary: verification.summary,
          contentHash: extraction.contentHash,
        });
        counts.created += 1;
      }

      const stats = http.stats();
      await finishIngestionRun(runId, counts, "ok", null, {
        gateDecision: "allowed",
        requestsMade: stats.requests + officialHttp.stats().requests,
        notModified: stats.notModified + officialHttp.stats().notModified,
      });
      await recordRunOutcome(descriptor.id, {
        ok: true,
        failureThreshold: descriptor.failureThreshold,
      });
      summaries.push({ source: descriptor.id, status: "ok", ...counts });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await finishIngestionRun(runId, counts, "error", message, {
        gateDecision: "allowed",
        requestsMade: http.stats().requests,
        notModified: http.stats().notModified,
      });
      // Feed the circuit breaker: enough consecutive failures and the gate
      // itself will refuse this source until a human resolves it.
      await recordRunOutcome(descriptor.id, {
        ok: false,
        failureClass: message.slice(0, 120),
        failureThreshold: descriptor.failureThreshold,
      }).catch(() => {});
      summaries.push({ source: descriptor.id, status: "error", ...counts });
    }
  }

  return summaries;
}
