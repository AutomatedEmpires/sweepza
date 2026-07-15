import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/server";
import type { DedupKeys } from "@/lib/ingestion/fingerprint";

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

export async function finishIngestionRun(
  runId: string,
  counts: IngestionRunCounts,
  status: "ok" | "error" = "ok",
  notes?: string,
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
  const { data, error } = await supabase
    .from("listing_ingestion")
    .select("listing_id, content_hash")
    .eq("official_url_key", urlKey)
    .maybeSingle<{ listing_id: string; content_hash: string | null }>();
  if (error) throw new Error(`findIngestionByUrlKey failed: ${error.message}`);
  return data ? { listingId: data.listing_id, contentHash: data.content_hash } : null;
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
  rawSnapshotRef?: string | null;
  extractionConfidence?: number | null;
  contentHash?: string | null;
}

/** Upsert the provenance row for a listing (created or refreshed). */
export async function recordProvenance(
  listingId: string,
  input: ProvenanceInput,
): Promise<void> {
  const supabase = createServiceRoleClient();
  const { error } = await supabase.from("listing_ingestion").upsert(
    {
      listing_id: listingId,
      official_url_key: input.officialUrlKey,
      content_fingerprint: input.contentFingerprint,
      discovery_source: input.discoverySource,
      official_source_url: input.officialSourceUrl,
      raw_snapshot_ref: input.rawSnapshotRef ?? null,
      extraction_confidence: input.extractionConfidence ?? null,
      content_hash: input.contentHash ?? null,
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: "listing_id" },
  );
  if (error) throw new Error(`recordProvenance failed: ${error.message}`);
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
