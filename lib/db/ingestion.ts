import "server-only";

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

/**
 * Atomically claim the candidate identity and create its private draft plus
 * provenance. The database function owns the transaction: concurrent cron
 * invocations either create one row or receive that same row as an existing
 * duplicate, and a provenance failure cannot strand an orphan listing.
 */
export async function createIngestedListingWithProvenance(
  candidate: NormalizedCandidate,
  input: ProvenanceInput,
): Promise<{ listingId: string; created: boolean; suspectedDuplicateIds: string[] }> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase.rpc("create_ingested_listing_with_provenance", {
    p_candidate: candidate,
    p_provenance: {
      officialUrlKey: input.officialUrlKey,
      contentFingerprint: input.contentFingerprint,
      variantKey: input.variantKey,
      discoverySource: input.discoverySource,
      officialSourceUrl: input.officialSourceUrl,
      extractionConfidence: input.extractionConfidence ?? null,
      extractionFactors: input.extractionFactors ?? null,
      extractionSummary: input.extractionSummary ?? null,
      contentHash: input.contentHash ?? null,
    },
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
