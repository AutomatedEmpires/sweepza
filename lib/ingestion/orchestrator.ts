import "server-only";

import { env } from "@/lib/env";
import { freebieGuyAdapter } from "@/lib/ingestion/adapters/freebie-guy";
import { sweepsAdvantageAdapter } from "@/lib/ingestion/adapters/sweeps-advantage";
import { sweepstakesTodayAdapter } from "@/lib/ingestion/adapters/sweepstakes-today";
import { extractOfficialPage } from "@/lib/ingestion/extract";
import { normalizeUrl } from "@/lib/ingestion/fingerprint";
import { evaluateSourceGate, describeGateDecision } from "@/lib/ingestion/gate";
import {
  createSourceHttpClient,
  isRetryable,
  type FetchFailureClass,
  type FetchStatePort,
} from "@/lib/ingestion/http";
import { mapExtraction } from "@/lib/ingestion/mapper";
import { processListingImage } from "@/lib/ingestion/image-pipeline";
import {
  SOURCE_REGISTRY,
  SourceFetchError,
  getSourceDescriptor,
  type SourceAdapter,
} from "@/lib/ingestion/source";
import { verifyCandidate } from "@/lib/ingestion/verify";
import {
  createIngestedListingWithProvenance,
  finishIngestionRun,
  startIngestionRun,
  type IngestionRunCounts,
} from "@/lib/db/ingestion";
import { discoveryWorkQueue } from "@/lib/db/discovery-work";
import {
  finalizeListingImage,
  storeListingMedia,
} from "@/lib/db/listing-media";
import {
  acquireSourceRunLease,
  finishSourceRunLease,
  getFetchState,
  getSourceRecord,
  releaseSourceRunLease,
  saveFetchState,
} from "@/lib/db/source-registry";

// The pipeline assembly: for each source, ASK THE GATE → discover leads →
// resolve official URL → extract at the
// source → map to canonical → dedupe → atomically create a DRAFT (review-only)
// listing + provenance. Everything an agent finds waits for a human; nothing
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

/** Only transient transport/server failures represent source availability. */
function isSourceAvailabilityFailure(failure: FetchFailureClass): boolean {
  return isRetryable(failure);
}

/**
 * A validator belongs to the URL that emitted it. We intentionally do not save
 * final-hop validators for a redirecting request: the next run starts at the
 * original URL, so loading that validator under either key would be unsafe or
 * useless. HTTP performs the same guard for its automatic persistence path.
 */
async function saveAcceptedOfficialFetchState(
  requestedUrl: string,
  extraction: { finalUrl: string; fetchState: { etag: string | null; lastModified: string | null; httpStatus: number } },
  port: FetchStatePort,
): Promise<void> {
  // This is transport identity, not listing-dedup identity. `normalizeUrl`
  // deliberately collapses www, scheme, tracking parameters, and trailing
  // slash; any of those can still be a real redirect with a different ETag.
  if (extraction.finalUrl !== requestedUrl) return;
  await port.save(requestedUrl, { ...extraction.fetchState, notModified: false });
}

export async function runIngestion(
  options: { limit?: number } = {},
): Promise<IngestionSourceSummary[]> {
  const limit = options.limit ?? 25;
  const summaries: IngestionSourceSummary[] = [];

  // official_direct is one source for the whole invocation. Gate it once and,
  // if allowed, share one client so its run budget and cadence are real global
  // limits rather than resetting independently for every discovery adapter.
  const official = officialPageDescriptor();
  const officialRecord = await getSourceRecord(official.id).catch(() => null);
  const officialDecision = evaluateSourceGate({
    descriptor: official,
    record: officialRecord,
    ingestionEnabled: env.INGESTION_ENABLED,
  });
  const officialFetchState = fetchStatePort(official.id);
  let officialHttp: ReturnType<typeof createSourceHttpClient> | null = null;
  let officialLeaseToken: string | null = null;
  let officialLeaseDenial: string | null = null;
  let officialHealthyResponses = 0;
  let officialAvailabilityFailures = 0;

  const ensureOfficialClient = async () => {
    if (officialHttp) return officialHttp;
    if (officialLeaseDenial) return null;
    const lease = await acquireSourceRunLease(
      official.id,
      official.refreshIntervalMinutes,
    );
    if (!lease.ok) {
      officialLeaseDenial = `lease_${lease.error}${lease.detail ? `: ${lease.detail}` : ""}`;
      return null;
    }
    officialLeaseToken = lease.token;
    officialHttp = createSourceHttpClient(official, { fetchState: officialFetchState });
    return officialHttp;
  };

  try {
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
    if (!officialDecision.allowed) {
      // No official fetch means no verifiable fact, and an unverified listing is
      // the one thing this pipeline must never create. Skip the whole source.
      const gate = `official_direct ${describeGateDecision(officialDecision)}`;
      const skippedRunId = await startIngestionRun(descriptor.id);
      await finishIngestionRun(skippedRunId, {}, "skipped", gate, { gateDecision: gate });
      summaries.push({ source: descriptor.id, status: "skipped", gate });
      continue;
    }

    // The pure gate above is an early explanation. This locked database lease
    // is the execution authority: it closes the race where two invocations
    // read the same due row before either records last_run_at.
    const runId = await startIngestionRun(descriptor.id);
    let sourceLease;
    try {
      sourceLease = await acquireSourceRunLease(
        descriptor.id,
        descriptor.refreshIntervalMinutes,
      );
    } catch (error) {
      // The RPC may have committed before its response was lost. Without the
      // token we cannot safely release it; the bounded TTL resolves authority.
      // The audit row, however, must never remain permanently `running`.
      const message = error instanceof Error ? error.message : String(error);
      await finishIngestionRun(runId, {}, "error", message, {
        gateDecision: "allowed",
        requestsMade: 0,
        notModified: 0,
      }).catch(() => undefined);
      summaries.push({ source: descriptor.id, status: "error" });
      continue;
    }
    if (!sourceLease.ok) {
      const gate = `lease_${sourceLease.error}${sourceLease.detail ? `: ${sourceLease.detail}` : ""}`;
      await finishIngestionRun(runId, {}, "skipped", gate, { gateDecision: gate });
      summaries.push({ source: descriptor.id, status: "skipped", gate });
      continue;
    }

    const counts: Required<IngestionRunCounts> = {
      discovered: 0, fetched: 0, created: 0, updated: 0, skipped: 0, failed: 0,
    };
    let http: ReturnType<typeof createSourceHttpClient> | null = null;
    let sourceNetworkStarted = false;
    let sourceLeaseFinalized = false;
    let sourceLeaseOutcome: {
      ok: boolean;
      failureClass?: string;
      failureThreshold: number;
    } = { ok: true, failureThreshold: descriptor.failureThreshold };
    let officialRunStats = () => ({ requests: 0, notModified: 0 });
    try {
      http = createSourceHttpClient(descriptor, {
        fetchState: fetchStatePort(descriptor.id),
      });
      const readOfficialStats = () => {
        const client = officialHttp as ReturnType<typeof createSourceHttpClient> | null;
        return client?.stats() ?? {
          requests: 0, budget: official.requestBudgetPerRun, notModified: 0, failures: 0,
        };
      };
      const officialStatsBefore = readOfficialStats();
      officialRunStats = () => {
        const current = readOfficialStats();
        return {
          requests: current.requests - officialStatsBefore.requests,
          notModified: current.notModified - officialStatsBefore.notModified,
        };
      };
      const workQueue = discoveryWorkQueue(descriptor.id);
      sourceNetworkStarted = true;
      const leads = await adapter.discover({
        http,
        workQueue,
        limit,
      });
      counts.discovered = leads.length;

      const held: string[] = [];
      const mediaRetries: string[] = [];
      // Tracked apart from counts.failed, which deliberately conflates two very
      // different facts: an official page we could not fetch (an outage signal)
      // and a candidate we fetched fine and then rejected (a policy outcome).
      // Only the former may trip the circuit breaker.
      let healthyOfficialResponses = 0;
      let officialAvailabilityFailuresThisSource = 0;
      for (const lead of leads) {
        const acknowledgeLead = async () => {
          if (lead.discoveryWorkKey) await workQueue.complete(lead.discoveryWorkKey);
        };
        const urlKey = normalizeUrl(lead.officialUrl);
        if (!urlKey) {
          await acknowledgeLead();
          counts.skipped += 1;
          continue;
        }

        // Acquire the official-source lease lazily. A quiet discovery pass, or
        // a pass containing only no leads, must not consume the sponsor source's
        // independent daily cadence. URL alone is not an idempotency key here:
        // sponsors reuse landing pages for later cycles and regional variants.
        const activeOfficialHttp = await ensureOfficialClient();
        if (!activeOfficialHttp) {
          if (lead.discoveryWorkKey) await workQueue.defer(lead.discoveryWorkKey);
          throw new Error(`official_direct ${officialLeaseDenial ?? "lease unavailable"}`);
        }

        // Fetch + extract the official page (the source of truth). The result is
        // CLASSIFIED: only a real HTTP failure from the source counts toward the
        // circuit breaker. A 304 is not a failure at all, and an extractor that
        // returned nothing is our problem, not the sponsor's — charging either
        // to the source would open its circuit for our own bugs.
        const result = await extractOfficialPage(lead.officialUrl, { http: activeOfficialHttp })
          .catch((error: unknown) => ({
            status: "unextractable" as const,
            message: error instanceof Error ? error.message : String(error),
          }));
        counts.fetched += 1;

        if (result.status === "not_modified") {
          healthyOfficialResponses += 1;
          officialHealthyResponses += 1;
          counts.skipped += 1;
          await acknowledgeLead();
          continue;
        }
        if (result.status === "failed") {
          // 404/410 is a durable answer for this discovered item, not an
          // outage and not retryable work. Policy/budget and transient failures
          // remain deferred so authority or availability can recover later.
          if (result.failure === "not_found") {
            healthyOfficialResponses += 1;
            officialHealthyResponses += 1;
            counts.skipped += 1;
            await acknowledgeLead();
            continue;
          }
          counts.failed += 1;
          if (isSourceAvailabilityFailure(result.failure)) {
            officialAvailabilityFailuresThisSource += 1;
            officialAvailabilityFailures += 1;
          }
          if (lead.discoveryWorkKey) await workQueue.defer(lead.discoveryWorkKey);
          continue;
        }
        if (result.status === "unextractable") {
          healthyOfficialResponses += 1;
          officialHealthyResponses += 1;
          counts.failed += 1; // ours: recorded, but never fed to the breaker
          if (lead.discoveryWorkKey) await workQueue.defer(lead.discoveryWorkKey);
          continue;
        }

        healthyOfficialResponses += 1;
        officialHealthyResponses += 1;

        const mapped = mapExtraction(result.extraction.raw);
        // Media is deterministic and rights-gated. Never persist an image URL
        // emitted by the language model or leave an external hotlink in the
        // canonical listing while the media pipeline is still pending.
        const candidate = {
          ...mapped.candidate,
          mainImageUrl: null,
          imageAltText: null,
        };

        // Hard gate: a candidate that fails any non-negotiable (title/
        // description/prize substance, official rules URL, entry URL,
        // no-purchase signal, live end date) never becomes a row — not even a
        // review-queue draft. This is the single hold path, so every held
        // candidate's failed check ids land in the run notes for operators.
        // (The title/description/prize hard checks also cover the DB's
        // NOT NULL constraints — nothing uncreatable gets past this point.)
        const verification = verifyCandidate(candidate);
        if (!verification.publishable) {
          // Verification reached a durable terminal decision for this exact
          // body. A future 304 may safely skip it; a changed ETag will re-run
          // extraction and verification.
          await saveAcceptedOfficialFetchState(
            lead.officialUrl,
            result.extraction,
            officialFetchState,
          );
          counts.failed += 1;
          held.push(`${urlKey}: ${verification.hardFailures.join(",")}`);
          await acknowledgeLead();
          continue;
        }

        // The database owns identity atomically. Same URL+variant claims are
        // idempotent; cross-URL content matches create a separate private draft
        // plus an explainable suspected-duplicate pair for human resolution.
        const claim = await createIngestedListingWithProvenance(candidate, {
          officialUrlKey: candidate.dedup.urlKey,
          contentFingerprint: candidate.dedup.contentKey,
          variantKey: candidate.dedup.variantKey,
          discoverySource: descriptor.id,
          officialSourceUrl: urlKey,
          extractionConfidence: verification.confidence,
          extractionFactors: verification.factors,
          extractionSummary: verification.summary,
          contentHash: result.extraction.contentHash,
        });

        const imageResult = await processListingImage({
          discovery: result.extraction.imageDiscovery,
          prizeCategory: candidate.prizeCategory,
          prizeName: candidate.prizeName,
          http: activeOfficialHttp,
          storage: { store: storeListingMedia },
        });
        await finalizeListingImage({
          listingId: claim.listingId,
          sourcePageUrl: result.extraction.finalUrl,
          result: imageResult,
        });

        if (claim.created) counts.created += 1;
        else counts.skipped += 1;

        if (imageResult.retryable) {
          counts.failed += 1;
          mediaRetries.push(urlKey);
          if (lead.discoveryWorkKey) await workQueue.defer(lead.discoveryWorkKey);
          continue;
        }

        // Commit the page validator only after listing identity, media state,
        // and diagnostics all reached a durable terminal state. If media
        // persistence fails, the unchanged page must remain retryable.
        await saveAcceptedOfficialFetchState(
          lead.officialUrl,
          result.extraction,
          officialFetchState,
        );
        await acknowledgeLead();
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
      const outage = officialAvailabilityFailuresThisSource > 0 && healthyOfficialResponses === 0;
      const outageNote = `every observable official response failed (${officialAvailabilityFailuresThisSource} failures)`;

      const stats = http.stats();
      const officialStats = officialRunStats();
      const notes = [
        outage ? outageNote : null,
        held.length > 0 ? `held: ${held.join("; ")}` : null,
        mediaRetries.length > 0 ? `media retry: ${mediaRetries.join("; ")}` : null,
      ].filter(Boolean).join(" | ");

      await finishIngestionRun(
        runId,
        counts,
        outage ? "error" : "ok",
        notes.length > 0 ? notes.slice(0, 2000) : null,
        {
          gateDecision: "allowed",
          requestsMade: stats.requests + officialStats.requests,
          notModified: stats.notModified + officialStats.notModified,
        },
      );
      await finishSourceRunLease(descriptor.id, sourceLease.token, {
        // Per-lead sponsor failures belong to official_direct. Reaching this
        // success path proves the discovery source's own hub/index was healthy.
        ok: true,
        failureThreshold: descriptor.failureThreshold,
      });
      sourceLeaseFinalized = true;
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
        requestsMade: (http?.stats().requests ?? 0) + officialRunStats().requests,
        notModified: (http?.stats().notModified ?? 0) + officialRunStats().notModified,
      }).catch(() => {});
      // Only the adapter's discovery request owns this source breaker. Once it
      // returned, mapper/LLM/database failures are internal pipeline failures
      // and must not disable a healthy external discovery source.
      const sourceUnavailable = error instanceof SourceFetchError;
      sourceLeaseOutcome = {
        ok: !sourceUnavailable,
        ...(sourceUnavailable ? { failureClass: message.slice(0, 120) } : {}),
        failureThreshold: descriptor.failureThreshold,
      };
      try {
        await finishSourceRunLease(descriptor.id, sourceLease.token, sourceLeaseOutcome);
        sourceLeaseFinalized = true;
      } catch {
        // The finally below retries cleanup with the same outcome.
      }
      summaries.push({ source: descriptor.id, status: "error", ...counts });
    } finally {
      if (!sourceLeaseFinalized) {
        if (sourceNetworkStarted) {
          await finishSourceRunLease(
            descriptor.id,
            sourceLease.token,
            sourceLeaseOutcome,
          ).catch(() => undefined);
        } else {
          await releaseSourceRunLease(descriptor.id, sourceLease.token).catch(() => undefined);
        }
      }
    }
    }
  } finally {
    // Every acquired official lease is owned by this function-level finally.
    // A throw anywhere after lazy acquisition cannot leave it active until TTL.
    if (officialLeaseToken) {
      const outage = officialAvailabilityFailures > 0 && officialHealthyResponses === 0;
      await finishSourceRunLease(official.id, officialLeaseToken, {
        ok: !outage,
        ...(outage
          ? { failureClass: `every observable official response failed (${officialAvailabilityFailures} failures)` }
          : {}),
        failureThreshold: official.failureThreshold,
      });
    }
  }

  return summaries;
}
