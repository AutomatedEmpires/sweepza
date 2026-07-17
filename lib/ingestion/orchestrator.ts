import "server-only";

import { env } from "@/lib/env";
import { freebieGuyAdapter } from "@/lib/ingestion/adapters/freebie-guy";
import { sweepsAdvantageAdapter } from "@/lib/ingestion/adapters/sweeps-advantage";
import { sweepstakesTodayAdapter } from "@/lib/ingestion/adapters/sweepstakes-today";
import { extractOfficialPage } from "@/lib/ingestion/extract";
import { normalizeUrl } from "@/lib/ingestion/fingerprint";
import { evaluateSourceGate, describeGateDecision } from "@/lib/ingestion/gate";
import { createSourceHttpClient, type FetchStatePort } from "@/lib/ingestion/http";
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
import {
  getFetchState,
  getSourceRecord,
  recordRunOutcome,
  saveFetchState,
} from "@/lib/db/source-registry";

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

/**
 * Backs the client's conditional-GET with the real `source_fetch_state` table.
 *
 * `supportsConditionalRequests` was true on three of four sources and did
 * nothing: nobody loaded a validator, nobody saved one, so the table stayed
 * empty and every pass re-downloaded pages the source would have 304'd. Every
 * operation is best-effort — remembering an ETag is an optimisation, and it must
 * never be the reason a fetch fails.
 */
function fetchStatePort(sourceId: string): FetchStatePort {
  return {
    async load(url) {
      const key = normalizeUrl(url);
      if (!key) return null;
      const state = await getFetchState(sourceId, key).catch(() => null);
      if (!state) return null;
      return { etag: state.etag, lastModified: state.lastModified };
    },
    async save(url, state) {
      const key = normalizeUrl(url);
      if (!key) return;
      await saveFetchState(sourceId, key, {
        etag: state.etag,
        lastModified: state.lastModified,
        lastStatus: state.httpStatus,
        // A 304 means the page did NOT change — only a 200 advances last_changed_at.
        changed: !state.notModified,
      }).catch(() => undefined);
    },
  };
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

    // official_direct is a SOURCE, and it gets its own gate. Approving a
    // discovery source says nothing about whether we may fetch sponsor pages:
    // that is a separate policy with its own compliance state and ToS posture.
    // Creating its client off the back of the discoverer's approval let an
    // unapproved source execute the moment any discoverer was approved, which
    // is exactly the fail-closed per-source guarantee this module claims above.
    const official = officialPageDescriptor();
    const officialRecord = await getSourceRecord(official.id).catch(() => null);
    const officialDecision = evaluateSourceGate({
      descriptor: official,
      record: officialRecord,
      ingestionEnabled: env.INGESTION_ENABLED,
    });

    if (!officialDecision.allowed) {
      // No official fetch means no verifiable fact, and an unverified listing is
      // the one thing this pipeline must never create. Skip the whole source.
      const gate = `official_direct ${describeGateDecision(officialDecision)}`;
      const skippedRunId = await startIngestionRun(descriptor.id);
      await finishIngestionRun(skippedRunId, {}, "skipped", gate, { gateDecision: gate });
      summaries.push({ source: descriptor.id, status: "skipped", gate });
      continue;
    }

    const runId = await startIngestionRun(descriptor.id);
    const counts: Required<IngestionRunCounts> = {
      discovered: 0, fetched: 0, created: 0, updated: 0, skipped: 0, failed: 0,
    };

    const http = createSourceHttpClient(descriptor, {
      fetchState: fetchStatePort(descriptor.id),
    });
    const officialHttp = createSourceHttpClient(official, {
      fetchState: fetchStatePort(official.id),
    });
    const officialStats = () => officialHttp.stats();

    try {
      const leads = await adapter.discover({ http, limit });
      counts.discovered = leads.length;

      const seenThisRun = new Set<string>();
      const held: string[] = [];
      // Tracked apart from counts.failed, which deliberately conflates two very
      // different facts: an official page we could not fetch (an outage signal)
      // and a candidate we fetched fine and then rejected (a policy outcome).
      // Only the former may trip the circuit breaker.
      let fetchFailures = 0;
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

        // Fetch + extract the official page (the source of truth). The result is
        // CLASSIFIED: only a real HTTP failure from the source counts toward the
        // circuit breaker. A 304 is not a failure at all, and an extractor that
        // returned nothing is our problem, not the sponsor's — charging either
        // to the source would open its circuit for our own bugs.
        const result = await extractOfficialPage(lead.officialUrl, { http: officialHttp })
          .catch((error: unknown) => ({
            status: "unextractable" as const,
            message: error instanceof Error ? error.message : String(error),
          }));
        counts.fetched += 1;

        if (result.status === "not_modified") {
          counts.skipped += 1;
          continue;
        }
        if (result.status === "failed") {
          counts.failed += 1;
          fetchFailures += 1; // the source answered badly — this is its fault
          continue;
        }
        if (result.status === "unextractable") {
          counts.failed += 1; // ours: recorded, but never fed to the breaker
          continue;
        }

        const { candidate } = mapExtraction(result.extraction.raw);

        // Hard gate: a candidate that fails any non-negotiable (title/
        // description/prize substance, official rules URL, entry URL,
        // no-purchase signal, live end date) never becomes a row — not even a
        // review-queue draft. This is the single hold path, so every held
        // candidate's failed check ids land in the run notes for operators.
        // (The title/description/prize hard checks also cover the DB's
        // NOT NULL constraints — nothing uncreatable gets past this point.)
        const verification = verifyCandidate(candidate);
        if (!verification.publishable) {
          counts.failed += 1;
          held.push(`${urlKey}: ${verification.hardFailures.join(",")}`);
          continue;
        }

        // Cross-source dedupe: same sweep already known under another link.
        const duplicateOf = await findExistingListingId(candidate.dedup);
        if (duplicateOf) {
          counts.skipped += 1;
          continue;
        }

        const listingId = await createIngestedListing(candidate);
        const snapshotRef = await snapshotOfficialRules(lead.officialUrl, result.extraction.pageText);
        await recordProvenance(listingId, {
          officialUrlKey: candidate.dedup.urlKey,
          contentFingerprint: candidate.dedup.contentKey,
          discoverySource: descriptor.id,
          officialSourceUrl: urlKey,
          rawSnapshotRef: snapshotRef,
          extractionConfidence: verification.confidence,
          extractionFactors: verification.factors,
          extractionSummary: verification.summary,
          contentHash: result.extraction.contentHash,
        });
        counts.created += 1;
      }

      // Both sides of the merge are wanted: main (#78) reports which candidates
      // were held back, this branch reports gate + request telemetry. The notes
      // and telemetry parameters are independent, so neither is dropped.
      // A pass that fetched official pages and failed EVERY one is an outage,
      // not a quiet day. Recording `ok` here reset consecutive_failures on
      // exactly the outages the breaker exists to contain — adapters turn
      // discovery failures into [] and extractOfficialPage turns fetch failures
      // into null, so neither reached `catch`. Zero leads with zero failures is
      // still a genuine quiet day; held candidates are a policy outcome and are
      // excluded, because the source answered us perfectly well.
      const outage = counts.fetched > 0 && fetchFailures === counts.fetched;
      const outageNote = `every official fetch failed (${fetchFailures}/${counts.fetched})`;

      const stats = http.stats();
      const notes = [
        outage ? outageNote : null,
        held.length > 0 ? `held: ${held.join("; ")}` : null,
      ].filter(Boolean).join(" | ");

      await finishIngestionRun(
        runId,
        counts,
        outage ? "error" : "ok",
        notes.length > 0 ? notes.slice(0, 2000) : null,
        {
          gateDecision: "allowed",
          requestsMade: stats.requests + officialStats().requests,
          notModified: stats.notModified + officialStats().notModified,
        },
      );
      await recordRunOutcome(descriptor.id, {
        ok: !outage,
        ...(outage ? { failureClass: outageNote } : {}),
        failureThreshold: descriptor.failureThreshold,
      });
      summaries.push({
        source: descriptor.id,
        status: outage ? "error" : "ok",
        ...counts,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // Include the official client's requests: the success path counted them,
      // so omitting them here made every failed run under-report its own
      // network activity — the audit was wrong exactly when it mattered most.
      await finishIngestionRun(runId, counts, "error", message, {
        gateDecision: "allowed",
        requestsMade: http.stats().requests + officialStats().requests,
        notModified: http.stats().notModified + officialStats().notModified,
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
