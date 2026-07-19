import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/server";
import type { DedupKeys } from "@/lib/ingestion/fingerprint";
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

export interface ExistingIngestion {
  listingId: string;
  contentHash: string | null;
}

/**
 * Idempotency lookup by the primary identity (official URL key). A hit means
 * the sweep is already in the catalog — refresh it, don't re-create. The
 * caller compares content_hash to decide whether to re-run extraction at all.
 */
export async function findIngestionByUrlKey(
  urlKey: string,
): Promise<ExistingIngestion | null> {
  const supabase = createServiceRoleClient();
  const { data: canonical, error: canonicalError } = await supabase
    .from("listing_ingestion")
    .select("listing_id, content_hash")
    .eq("official_url_key", urlKey)
    .maybeSingle<{ listing_id: string; content_hash: string | null }>();
  if (canonicalError) {
    throw new Error(`findIngestionByUrlKey (canonical) failed: ${canonicalError.message}`);
  }
  if (canonical) {
    return { listingId: canonical.listing_id, contentHash: canonical.content_hash };
  }

  // Discovery links commonly redirect to a canonical rules URL. Provenance
  // stores both identities; a future run starts with the discovery URL, so it
  // must consult official_source_url too or it will fetch and recreate the same
  // listing forever. Two equality queries avoid PostgREST `.or(...)` grammar,
  // where legal URL characters such as commas and parentheses need escaping.
  const { data: discovered, error: discoveredError } = await supabase
    .from("listing_ingestion")
    .select("listing_id, content_hash")
    .eq("official_source_url", urlKey)
    .limit(1)
    .maybeSingle<{ listing_id: string; content_hash: string | null }>();
  if (discoveredError) {
    throw new Error(`findIngestionByUrlKey (discovered) failed: ${discoveredError.message}`);
  }
  return discovered
    ? { listingId: discovered.listing_id, contentHash: discovered.content_hash }
    : null;
}

/**
 * Dedup lookup for a fresh candidate: match on the official URL key first, then
 * fall back to the content fingerprint. Returns the existing listing id when
 * the sweep is already known (so it's an update, or a suspected duplicate to
 * hold), or null when it's genuinely new.
 */
export async function findExistingListingId(keys: DedupKeys): Promise<string | null> {
  const supabase = createServiceRoleClient();

  if (keys.urlKey) {
    const { data, error } = await supabase
      .from("listing_ingestion")
      .select("listing_id")
      .eq("official_url_key", keys.urlKey)
      .maybeSingle<{ listing_id: string }>();
    if (error) throw new Error(`findExistingListingId (url) failed: ${error.message}`);
    if (data) return data.listing_id;
  }

  const { data, error } = await supabase
    .from("listing_ingestion")
    .select("listing_id")
    .eq("content_fingerprint", keys.contentKey)
    .limit(1)
    .maybeSingle<{ listing_id: string }>();
  if (error) throw new Error(`findExistingListingId (fingerprint) failed: ${error.message}`);
  return data?.listing_id ?? null;
}

export interface ProvenanceInput {
  officialUrlKey: string | null;
  contentFingerprint: string;
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
): Promise<{ listingId: string; created: boolean }> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase.rpc("create_ingested_listing_with_provenance", {
    p_candidate: candidate,
    p_provenance: {
      officialUrlKey: input.officialUrlKey,
      contentFingerprint: input.contentFingerprint,
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
  const result = data as { listing_id?: string; created?: boolean } | null;
  if (!result?.listing_id || typeof result.created !== "boolean") {
    throw new Error("createIngestedListingWithProvenance failed: invalid RPC result");
  }
  return { listingId: result.listing_id, created: result.created };
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
