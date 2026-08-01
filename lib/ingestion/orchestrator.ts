import "server-only";

import { env } from "@/lib/env";
import { freebieGuyAdapter } from "@/lib/ingestion/adapters/freebie-guy";
import { sweepsAdvantageAdapter } from "@/lib/ingestion/adapters/sweeps-advantage";
import { sweepstakesTodayAdapter } from "@/lib/ingestion/adapters/sweepstakes-today";
import { extractOfficialPage } from "@/lib/ingestion/extract";
import { normalizeUrl } from "@/lib/ingestion/fingerprint";
import { evaluateSourceGate, describeGateDecision } from "@/lib/ingestion/gate";
import {
  evaluateOfficialDestinationPolicy,
  type OfficialDestinationPolicy,
} from "@/lib/ingestion/official-destination-policy";
import {
  createSourceHttpClient,
  isRetryable,
  isRetryableOnLaterRun,
  type FetchFailureClass,
  type FetchStatePort,
} from "@/lib/ingestion/http";
import { mapExtraction } from "@/lib/ingestion/mapper";
import { processListingImage } from "@/lib/ingestion/image-pipeline";
import {
  SOURCE_REGISTRY,
  SourceFetchError,
  getSourceDescriptor,
  type DiscoveredLead,
  type DiscoveryWorkQueue,
  type SourceAdapter,
} from "@/lib/ingestion/source";
import {
  takeOfficialUrlIntakeLeads,
  type AttributedOfficialLead,
} from "@/lib/ingestion/official-url-intake";
import { verifyCandidate } from "@/lib/ingestion/verify";
import {
  createIngestedListingWithProvenance,
  finishIngestionRun,
  startIngestionRun,
  type IngestionRunCounts,
} from "@/lib/db/ingestion";
import { listCurrentOfficialDestinationPolicies } from "@/lib/db/official-destination-policy";
import { enqueueDueOfficialUrlRevalidations } from "@/lib/db/official-url-intake";
import { discoveryWorkQueue } from "@/lib/db/discovery-work";
import { finalizeListingImage } from "@/lib/db/listing-media";
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

interface OfficialLeadBatchDiagnostics {
  held: string[];
  mediaRetries: string[];
  destinationDenials: string[];
  healthyResponses: number;
  availabilityFailures: number;
  successfulExtractions: number;
  extractionFailures: string[];
}

const MAX_FAILURE_DETAIL_CHARS = 500;

function boundedFailureDetail(error: unknown): string {
  const detail =
    error instanceof Error ? error.message : String(error);
  return (detail.trim() || "unknown failure")
    .replace(/\s+/g, " ")
    .slice(0, MAX_FAILURE_DETAIL_CHARS);
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
  let officialDestinationPolicies: OfficialDestinationPolicy[] | null = null;
  let officialLeaseToken: string | null = null;
  let officialLeaseDenial: string | null = null;
  let officialHealthyResponses = 0;
  let officialAvailabilityFailures = 0;

  const loadOfficialDestinationPolicies = async (
    options: { refresh?: boolean } = {},
  ) => {
    if (!options.refresh && officialDestinationPolicies) {
      return officialDestinationPolicies;
    }
    const currentPolicies =
      await listCurrentOfficialDestinationPolicies();
    officialDestinationPolicies = currentPolicies;
    return currentPolicies;
  };

  const ensureOfficialClient = async () => {
    if (officialHttp) return officialHttp;
    if (officialLeaseDenial) return null;
    await loadOfficialDestinationPolicies();
    const lease = await acquireSourceRunLease(
      official.id,
      official.refreshIntervalMinutes,
    );
    if (!lease.ok) {
      officialLeaseDenial = `lease_${lease.error}${lease.detail ? `: ${lease.detail}` : ""}`;
      return null;
    }
    officialLeaseToken = lease.token;
    officialHttp = createSourceHttpClient(official, {
      fetchState: officialFetchState,
      // The transport re-applies this database-backed authority to the initial
      // request, every redirect, and every image request. official_direct's
      // empty static host list can never become blanket internet reach.
      // Refresh the ledger on every initial/redirect/asset decision. Refreshing
      // only once per lead left a redirect or image fetch authorized by a
      // snapshot that could have been revoked while the request was in flight.
      urlPolicy: async (url) =>
        evaluateOfficialDestinationPolicy({
          url,
          policies: await loadOfficialDestinationPolicies({ refresh: true }),
        }).allowed,
    });
    return officialHttp;
  };

  const readOfficialStats = () => {
    const client =
      officialHttp as ReturnType<typeof createSourceHttpClient> | null;
    return client?.stats() ?? {
      requests: 0,
      budget: official.requestBudgetPerRun,
      notModified: 0,
      failures: 0,
    };
  };

  /**
   * The one official-page processing path for both directory discoveries and
   * authenticated first-party intake. Origin changes provenance only; every
   * URL still crosses the same destination authority, extraction, hard
   * verification, atomic identity claim, rights-safe media, and draft boundary.
   */
  const processOfficialLeadBatch = async (
    items: AttributedOfficialLead[],
    workQueue: DiscoveryWorkQueue,
    counts: Required<IngestionRunCounts>,
  ): Promise<OfficialLeadBatchDiagnostics> => {
    const held: string[] = [];
    const mediaRetries: string[] = [];
    const destinationDenials: string[] = [];
    let healthyResponses = 0;
    let availabilityFailures = 0;
    let successfulExtractions = 0;
    const extractionFailures: string[] = [];

    for (const item of items) {
      const { lead } = item;
      const acknowledgeLead = async () => {
        if (lead.discoveryWorkKey) {
          if (!lead.discoveryWorkClaimToken) {
            throw new Error(
              `discovery work "${lead.discoveryWorkKey}" is missing its claim token`,
            );
          }
          await workQueue.complete(
            lead.discoveryWorkKey,
            lead.discoveryWorkClaimToken,
          );
        }
      };
      const deferLead = async (reason: string) => {
        if (lead.discoveryWorkKey) {
          if (!lead.discoveryWorkClaimToken) {
            throw new Error(
              `discovery work "${lead.discoveryWorkKey}" is missing its claim token`,
            );
          }
          await workQueue.defer(
            lead.discoveryWorkKey,
            lead.discoveryWorkClaimToken,
            reason,
          );
        }
      };
      const quarantineLead = async (reason: string) => {
        if (lead.discoveryWorkKey) {
          if (!lead.discoveryWorkClaimToken) {
            throw new Error(
              `discovery work "${lead.discoveryWorkKey}" is missing its claim token`,
            );
          }
          await workQueue.deadLetter(
            lead.discoveryWorkKey,
            lead.discoveryWorkClaimToken,
            reason,
          );
        }
      };
      const urlKey = normalizeUrl(lead.officialUrl);
      if (!urlKey) {
        await quarantineLead("invalid_official_url");
        counts.skipped += 1;
        continue;
      }

      // Source approval never grants blanket internet reach. Each initial URL,
      // redirect, and image request requires a current attributed destination
      // policy. A denied/missing decision is terminally quarantined rather than
      // retried forever; an unreadable ledger remains a bounded retry.
      const destinationPolicies =
        await loadOfficialDestinationPolicies({ refresh: true }).catch(
          async (error: unknown) => {
            const policyFailure = boundedFailureDetail(error);
            let deferFailure: string | null = null;
            try {
              await deferLead(
                "official_destination_policy_unavailable",
              );
            } catch (deferError) {
              deferFailure = boundedFailureDetail(deferError);
            }
            throw new Error(
              `official destination policy unavailable: ${policyFailure}` +
                (deferFailure
                  ? `; queue defer failed: ${deferFailure}`
                  : ""),
            );
          },
        );
      const destinationDecision = evaluateOfficialDestinationPolicy({
        url: lead.officialUrl,
        policies: destinationPolicies,
      });
      if (!destinationDecision.allowed) {
        counts.skipped += 1;
        destinationDenials.push(
          `${urlKey}: ${destinationDecision.reason}`,
        );
        await quarantineLead(
          `official_destination_policy_denied:${destinationDecision.reason}`,
        );
        continue;
      }

      // Acquire the official lease only after at least one queued destination
      // is independently approved. A quiet or entirely gated batch consumes no
      // source cadence and performs no network request.
      const activeOfficialHttp = await ensureOfficialClient();
      if (!activeOfficialHttp) {
        await deferLead("official_source_lease_unavailable");
        throw new Error(
          `official_direct ${officialLeaseDenial ?? "lease unavailable"}`,
        );
      }

      const result = await extractOfficialPage(lead.officialUrl, {
        http: activeOfficialHttp,
      }).catch((error: unknown) => ({
        status: "unextractable" as const,
        message: error instanceof Error ? error.message : String(error),
      }));
      counts.fetched += 1;

      if (result.status === "not_modified") {
        healthyResponses += 1;
        officialHealthyResponses += 1;
        counts.skipped += 1;
        await acknowledgeLead();
        continue;
      }
      if (result.status === "failed") {
        // 404/410 and non-retryable transport/policy outcomes are durable
        // quarantine decisions. Only the central later-run retry taxonomy may
        // re-enter the bounded queue.
        if (result.failure === "not_found") {
          healthyResponses += 1;
          officialHealthyResponses += 1;
          counts.skipped += 1;
          await quarantineLead("official_page_not_found");
          continue;
        }
        counts.failed += 1;
        if (result.failure === "policy_unavailable") {
          // Authority becoming unreadable mid-hop is our control-plane
          // failure, not evidence that the sponsor is down. Preserve the work
          // and fail the run immediately; continuing would either use stale
          // permission or turn a compliance outage into a healthy cron.
          await deferLead("official_destination_policy_unavailable");
          throw new Error(result.message);
        }
        if (isSourceAvailabilityFailure(result.failure)) {
          availabilityFailures += 1;
          officialAvailabilityFailures += 1;
        }
        if (isRetryableOnLaterRun(result.failure)) {
          await deferLead(`official_fetch_${result.failure}`);
        } else {
          await quarantineLead(
            `terminal_official_fetch_${result.failure}`,
          );
        }
        continue;
      }
      if (result.status === "unextractable") {
        // The sponsor page answered successfully, so this is healthy source
        // HTTP and must never open that source's circuit. It is still an
        // internal pipeline failure: if every attempted extraction ends here,
        // the run must fail so the cron alerts instead of reporting success
        // through a total Anthropic/extractor outage.
        healthyResponses += 1;
        officialHealthyResponses += 1;
        extractionFailures.push(
          `${urlKey}: ${result.message.slice(0, 500)}`,
        );
        counts.failed += 1;
        await deferLead(
          `official_extraction_failed:${result.message.slice(0, 500)}`,
        );
        continue;
      }

      healthyResponses += 1;
      officialHealthyResponses += 1;
      successfulExtractions += 1;

      const mapped = mapExtraction(result.extraction.raw);
      // Never trust or hotlink a model-emitted image URL. The media pipeline
      // can only persist rights-classified media or its generated fallback.
      const candidate = {
        ...mapped.candidate,
        mainImageUrl: null,
        imageAltText: null,
      };
      const verification = verifyCandidate(candidate);
      if (!verification.publishable) {
        await saveAcceptedOfficialFetchState(
          lead.officialUrl,
          result.extraction,
          officialFetchState,
        );
        counts.failed += 1;
        held.push(`${urlKey}: ${verification.hardFailures.join(",")}`);
        await quarantineLead(
          `verification_failed:${verification.hardFailures.join(",")}`,
        );
        continue;
      }

      // This RPC creates only a private, unreviewed draft and owns exact +
      // suspected duplicate identity atomically. Intake authority never grants
      // publication or moderation authority.
      const claim = await createIngestedListingWithProvenance(candidate, {
        officialUrlKey: candidate.dedup.urlKey,
        contentFingerprint: candidate.dedup.contentKey,
        variantKey: candidate.dedup.variantKey,
        discoverySource: item.provenanceSource,
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
        storage: null,
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
        await deferLead("listing_media_retry_required");
        continue;
      }

      await saveAcceptedOfficialFetchState(
        lead.officialUrl,
        result.extraction,
        officialFetchState,
      );
      await acknowledgeLead();
    }

    return {
      held,
      mediaRetries,
      destinationDenials,
      healthyResponses,
      availabilityFailures,
      successfulExtractions,
      extractionFailures,
    };
  };

  try {
    // Authenticated first-party intake is a durable queue on official_direct,
    // not a synthetic directory source. It is drained first so approved
    // operator-supplied work gets the daily official-source budget without
    // falsifying discovery provenance.
    if (officialDecision.allowed) {
      // Enqueueing due revalidations is a maintenance step. If it fails, the
      // next scheduled run retries it; letting the throw escape here would
      // abort every discovery source in the invocation before any
      // ingestion_run row could record why.
      let revalidationFailure: string | null = null;
      try {
        await enqueueDueOfficialUrlRevalidations({
          limit,
          minAgeSeconds: official.refreshIntervalMinutes * 60,
        });
      } catch (error) {
        revalidationFailure = `official revalidation enqueue failed: ${(error instanceof Error ? error.message : String(error)).slice(0, MAX_FAILURE_DETAIL_CHARS)}`;
      }
      const directQueue = discoveryWorkQueue(official.id);
      const directLeads = await takeOfficialUrlIntakeLeads(
        directQueue,
        limit,
      );

      if (directLeads.length > 0) {
        const runId = await startIngestionRun(official.id);
        const counts: Required<IngestionRunCounts> = {
          discovered: directLeads.length,
          fetched: 0,
          created: 0,
          updated: 0,
          skipped: 0,
          failed: 0,
        };
        const statsBefore = readOfficialStats();
        const directStats = () => {
          const current = readOfficialStats();
          return {
            requests: current.requests - statsBefore.requests,
            notModified: current.notModified - statsBefore.notModified,
          };
        };

        try {
          const diagnostics = await processOfficialLeadBatch(
            directLeads,
            directQueue,
            counts,
          );
          const sourceOutage =
            diagnostics.availabilityFailures > 0 &&
            diagnostics.healthyResponses === 0;
          const extractorOutage =
            diagnostics.extractionFailures.length > 0 &&
            diagnostics.successfulExtractions === 0;
          const failed = sourceOutage || extractorOutage;
          const notes = [
            revalidationFailure,
            sourceOutage
              ? `every observable official response failed (${diagnostics.availabilityFailures} failures)`
              : null,
            extractorOutage
              ? `every attempted official-page extraction failed (${diagnostics.extractionFailures.length} failures): ${diagnostics.extractionFailures.join("; ")}`
              : null,
            diagnostics.held.length > 0
              ? `held: ${diagnostics.held.join("; ")}`
              : null,
            diagnostics.destinationDenials.length > 0
              ? `official destination denied: ${diagnostics.destinationDenials.join("; ")}`
              : null,
            diagnostics.mediaRetries.length > 0
              ? `media retry: ${diagnostics.mediaRetries.join("; ")}`
              : null,
          ]
            .filter(Boolean)
            .join(" | ");
          const stats = directStats();

          await finishIngestionRun(
            runId,
            counts,
            failed ? "error" : "ok",
            notes.length > 0 ? notes.slice(0, 2000) : null,
            {
              gateDecision: "allowed",
              requestsMade: stats.requests,
              notModified: stats.notModified,
            },
          );
          summaries.push({
            source: official.id,
            status: failed ? "error" : "ok",
            ...counts,
          });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          const stats = directStats();
          await finishIngestionRun(runId, counts, "error", message, {
            gateDecision: "allowed",
            requestsMade: stats.requests,
            notModified: stats.notModified,
          }).catch(() => undefined);
          summaries.push({
            source: official.id,
            status: "error",
            ...counts,
          });
        }
      } else if (revalidationFailure) {
        // No intake run exists to carry the note, so surface the failure as
        // an explicit error summary. The cron route reports error summaries
        // to Sentry, and the next scheduled invocation retries the sweep.
        summaries.push({
          source: official.id,
          status: "error",
          discovered: 0,
          fetched: 0,
          created: 0,
          updated: 0,
          skipped: 0,
          failed: 1,
        });
      }
    }

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

      const attributedLeads: AttributedOfficialLead[] = leads.map(
        (lead: DiscoveredLead) => ({
          lead,
          provenanceSource: descriptor.id,
        }),
      );
      const {
        held,
        mediaRetries,
        destinationDenials,
        healthyResponses: healthyOfficialResponses,
        availabilityFailures: officialAvailabilityFailuresThisSource,
        successfulExtractions,
        extractionFailures,
      } = await processOfficialLeadBatch(
        attributedLeads,
        workQueue,
        counts,
      );

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
      const sourceOutage =
        officialAvailabilityFailuresThisSource > 0 &&
        healthyOfficialResponses === 0;
      const extractorOutage =
        extractionFailures.length > 0 && successfulExtractions === 0;
      const failed = sourceOutage || extractorOutage;
      const outageNote = `every observable official response failed (${officialAvailabilityFailuresThisSource} failures)`;
      const extractorOutageNote =
        `every attempted official-page extraction failed (${extractionFailures.length} failures): ${extractionFailures.join("; ")}`;

      const stats = http.stats();
      const officialStats = officialRunStats();
      const notes = [
        sourceOutage ? outageNote : null,
        extractorOutage ? extractorOutageNote : null,
        held.length > 0 ? `held: ${held.join("; ")}` : null,
        destinationDenials.length > 0
          ? `official destination denied: ${destinationDenials.join("; ")}`
          : null,
        mediaRetries.length > 0 ? `media retry: ${mediaRetries.join("; ")}` : null,
      ].filter(Boolean).join(" | ");

      await finishIngestionRun(
        runId,
        counts,
        failed ? "error" : "ok",
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
        status: failed ? "error" : "ok",
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
