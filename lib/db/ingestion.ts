import "server-only";

import { createHash } from "node:crypto";
import { createServiceRoleClient } from "@/lib/supabase/server";
import type { NormalizedCandidate } from "@/lib/ingestion/mapper";
import type { EvidenceFactor } from "@/lib/ingestion/verify";

// Ingestion data layer — provenance, idempotency lookups, and run logging.
// Thin service-role wrappers the orchestrating cron calls; the dedup decisions
// themselves live in the pure lib/ingestion/* modules.

export interface IngestionRunCounts {
  discovered?: number;
  fetched?: number;
  created?: number;
  updated?: number;
  skipped?: number;
  failed?: number;
}

/** Open a run record; returns its id for the matching finish call. */
export async function startIngestionRun(source: string): Promise<string> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("ingestion_run")
    .insert({ source, status: "running" })
    .select("id")
    .single<{ id: string }>();
  if (error) throw new Error(`startIngestionRun failed: ${error.message}`);
  return data.id;
}

export interface RunTelemetry {
  /** Why the gate allowed or refused this source (lib/ingestion/gate.ts). */
  gateDecision?: string | null;
  requestsMade?: number;
  notModified?: number;
}

export async function finishIngestionRun(
  runId: string,
  counts: IngestionRunCounts,
  status: "ok" | "error" | "skipped" = "ok",
  notes?: string | null,
  telemetry: RunTelemetry = {},
): Promise<void> {
  const supabase = createServiceRoleClient();
  const { error } = await supabase
    .from("ingestion_run")
    .update({
      status,
      finished_at: new Date().toISOString(),
      notes: notes ?? null,
      discovered: counts.discovered ?? 0,
      fetched: counts.fetched ?? 0,
      created: counts.created ?? 0,
      updated: counts.updated ?? 0,
      skipped: counts.skipped ?? 0,
      failed: counts.failed ?? 0,
      gate_decision: telemetry.gateDecision ?? null,
      requests_made: telemetry.requestsMade ?? 0,
      not_modified: telemetry.notModified ?? 0,
    })
    .eq("id", runId);
  if (error) throw new Error(`finishIngestionRun failed: ${error.message}`);
}

/**
 * Vercel stops this cron after 300 seconds and source leases expire after 600
 * seconds. Waiting 15 minutes keeps recovery clear of both bounds while still
 * guaranteeing that an interrupted run cannot remain "running" indefinitely.
 */
export const STALE_INGESTION_RUN_AFTER_MINUTES = 15;

export interface StaleIngestionRunRecovery {
  recovered: number;
  recoveredAt: string;
  cutoffAt: string;
}

/**
 * Close audit rows abandoned by a terminated invocation.
 *
 * The status + age filters are part of the UPDATE, not a preceding read. That
 * makes concurrent/repeated recovery idempotent: after one caller changes a
 * row to "error", no later caller can match it. Source leases need no mutation
 * here; their 10-minute TTL is already expired before this 15-minute cutoff and
 * the next acquisition atomically replaces an expired token.
 */
export async function recoverStaleIngestionRuns(
  now: Date = new Date(),
): Promise<StaleIngestionRunRecovery> {
  const recoveredAt = now.toISOString();
  const cutoffAt = new Date(
    now.getTime() - STALE_INGESTION_RUN_AFTER_MINUTES * 60_000,
  ).toISOString();
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("ingestion_run")
    .update({
      status: "error",
      finished_at: recoveredAt,
      notes:
        `Automatic stale-run recovery: remained running beyond ` +
        `${STALE_INGESTION_RUN_AFTER_MINUTES} minutes; recovered_at=${recoveredAt}; ` +
        `cutoff_at=${cutoffAt}.`,
    })
    .eq("status", "running")
    .lt("started_at", cutoffAt)
    .select("id");

  if (error) {
    throw new Error(`recoverStaleIngestionRuns failed: ${error.message}`);
  }

  return {
    recovered: (data ?? []).length,
    recoveredAt,
    cutoffAt,
  };
}

export interface ProvenanceInput {
  officialUrlKey: string | null;
  contentFingerprint: string;
  variantKey: string;
  discoverySource: string;
  officialSourceUrl: string | null;
  extractionConfidence?: number | null;
  /** EvidenceFactor[] — the explanation behind the confidence number. */
  extractionFactors?: EvidenceFactor[] | null;
  extractionSummary?: string | null;
  contentHash?: string | null;
}

interface ProvenancePayload {
  officialUrlKey: string | null;
  contentFingerprint: string;
  variantKey: string;
  discoverySource: string;
  officialSourceUrl: string | null;
  extractionConfidence: number | null;
  extractionFactors: EvidenceFactor[] | null;
  extractionSummary: string | null;
  contentHash: string | null;
}

function provenancePayload(input: ProvenanceInput): ProvenancePayload {
  return {
    officialUrlKey: input.officialUrlKey,
    contentFingerprint: input.contentFingerprint,
    variantKey: input.variantKey,
    discoverySource: input.discoverySource,
    officialSourceUrl: input.officialSourceUrl,
    extractionConfidence: input.extractionConfidence ?? null,
    extractionFactors: input.extractionFactors ?? null,
    extractionSummary: input.extractionSummary ?? null,
    contentHash: input.contentHash ?? null,
  };
}

function canonicalJson(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item ?? null)).join(",")}]`;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries
      .map(
        ([key, item]) =>
          `${JSON.stringify(key)}:${canonicalJson(item)}`,
      )
      .join(",")}}`;
  }
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    const serialized = JSON.stringify(value);
    if (serialized !== undefined) return serialized;
  }
  throw new Error("provenance contains a non-JSON value");
}

function provenanceIdentity(payload: ProvenancePayload): string {
  return createHash("sha256")
    .update(canonicalJson(payload))
    .digest("hex");
}

/**
 * Claim candidate identity and create its private draft plus first-ingest
 * provenance in one database transaction. A second idempotent RPC records this
 * observation for both new and existing claims. If that observation fails, this
 * function throws so the durable queue retries instead of acknowledging work
 * whose later provenance was not preserved.
 */
export async function createIngestedListingWithProvenance(
  candidate: NormalizedCandidate,
  input: ProvenanceInput,
): Promise<{ listingId: string; created: boolean; suspectedDuplicateIds: string[] }> {
  const supabase = createServiceRoleClient();
  const provenance = provenancePayload(input);
  const { data, error } = await supabase.rpc("create_ingested_listing_with_provenance", {
    p_candidate: candidate,
    p_provenance: provenance,
  });
  if (error) {
    throw new Error(`createIngestedListingWithProvenance failed: ${error.message}`);
  }
  const result = data as {
    listing_id?: string;
    created?: boolean;
    suspected_duplicate_ids?: unknown;
  } | null;
  if (!result?.listing_id || typeof result.created !== "boolean") {
    throw new Error("createIngestedListingWithProvenance failed: invalid RPC result");
  }
  const suspectedDuplicateIds = Array.isArray(result.suspected_duplicate_ids)
    ? result.suspected_duplicate_ids.filter((value): value is string => typeof value === "string")
    : [];

  // The canonical claim intentionally preserves listing_ingestion as the
  // first-ingest record. Persist this sighting separately for both new and
  // exact-existing claims. A failure throws before the queue acknowledges the
  // item; retrying is safe because listing + provenance identity is idempotent.
  const { data: observationData, error: observationError } = await supabase.rpc(
    "record_listing_ingestion_observation",
    {
      p_listing_id: result.listing_id,
      p_provenance_identity: provenanceIdentity(provenance),
      p_provenance: provenance,
    },
  );
  if (observationError) {
    throw new Error(
      `createIngestedListingWithProvenance observation failed: ${observationError.message}`,
    );
  }
  const observation = observationData as {
    observation_id?: number | string;
    created?: boolean;
  } | null;
  const validObservationId =
    (typeof observation?.observation_id === "number" &&
      Number.isSafeInteger(observation.observation_id) &&
      observation.observation_id > 0) ||
    (typeof observation?.observation_id === "string" &&
      /^[1-9][0-9]*$/.test(observation.observation_id));
  if (!validObservationId || typeof observation?.created !== "boolean") {
    throw new Error(
      "createIngestedListingWithProvenance observation failed: invalid RPC result",
    );
  }

  return { listingId: result.listing_id, created: result.created, suspectedDuplicateIds };
}

/** Cheap refresh when a re-visited sweep is unchanged: bump last_seen_at only. */
export async function touchLastSeen(listingId: string): Promise<void> {
  const supabase = createServiceRoleClient();
  const { error } = await supabase
    .from("listing_ingestion")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("listing_id", listingId);
  if (error) throw new Error(`touchLastSeen failed: ${error.message}`);
}
