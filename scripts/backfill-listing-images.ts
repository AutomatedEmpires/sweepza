#!/usr/bin/env node

import { pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { listingFallbackImageUrl } from "@/lib/listing-media";
import type {
  ImageCandidateDiagnostic,
  ListingImagePipelineResult,
} from "@/lib/ingestion/image-pipeline";

export const SWEEPZA_SUPABASE_PROJECT_REF = "ojwhsntcpmoxnzisuomq";
// acquire_source_run_lease accepts 30-3600 seconds and has no renewal RPC.
// Use the supported maximum so a bounded image batch does not lose its lease
// while validating and storing multiple remote assets.
export const SOURCE_BACKFILL_LEASE_SECONDS = 3600;

function flagValue(argv: readonly string[], name: string): string | null {
  const prefix = `${name}=`;
  return argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length) ?? null;
}

/** Refuse every privileged write unless the canonical hosted project is exact. */
export function assertSweepzaSupabaseUrl(rawUrl: string): void {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error("Refusing service-role write: configured Supabase URL is invalid.");
  }
  const expectedHost = `${SWEEPZA_SUPABASE_PROJECT_REF}.supabase.co`;
  if (
    parsed.protocol !== "https:"
    || parsed.hostname.toLowerCase() !== expectedHost
    || parsed.port !== ""
    || (parsed.pathname !== "" && parsed.pathname !== "/")
    || parsed.search !== ""
    || parsed.hash !== ""
    || parsed.username !== ""
    || parsed.password !== ""
  ) {
    throw new Error(
      `Refusing service-role write: configured Supabase project is not Sweepza (${SWEEPZA_SUPABASE_PROJECT_REF}).`,
    );
  }
}

export function requireSweepzaBackfillProvider(environment: NodeJS.ProcessEnv = process.env): {
  url: string;
  key: string;
} {
  const url = environment.NEXT_PUBLIC_SUPABASE_URL ?? environment.SUPABASE_URL;
  const key = environment.SUPABASE_SERVICE_ROLE_KEY ?? environment.SUPABASE_SERVICE_ROLE;
  if (!url || !key) throw new Error("Missing Sweepza Supabase URL or service-role key.");

  // Every mode creates a privileged client. Dry-run is read-only, but reading
  // another venture with an inherited machine credential is still a boundary
  // violation, so identity validation is unconditional and precedes the client.
  assertSweepzaSupabaseUrl(url);
  return { url, key };
}

/** Source assets stay dormant until the provider contract adopts media. */
export function assertApprovedBackfillMode(fallbackOnly: boolean): void {
  if (!fallbackOnly) {
    throw new Error(
      "Source image backfill is disabled: Sweepza has no approved media storage provider.",
    );
  }
}

export type SourceLeaseSettlement =
  | { action: "release" }
  | { action: "finish"; ok: boolean; failureClass: string | null };

export function shouldSkipExistingAttempt(
  previous: { finalStatus: string; retryable: boolean } | null,
  retryFallbacks: boolean,
): boolean {
  return previous?.finalStatus === "source_image"
    || previous?.finalStatus === "sponsor_asset"
    || (
      previous?.finalStatus === "generated_fallback"
      && !previous.retryable
      && !retryFallbacks
    );
}

/**
 * Preserve every terminal fallback observation across candidate source pages.
 * A selected asset is conclusive: it replaces earlier fallback state and
 * prevents a later fallback from downgrading the listing.
 */
export function accumulateCandidatePageResult(
  current: ListingImagePipelineResult | null,
  next: ListingImagePipelineResult,
): ListingImagePipelineResult {
  if (current?.finalStatus !== "generated_fallback") {
    return current ?? next;
  }
  if (next.finalStatus !== "generated_fallback") return next;

  return {
    finalStatus: "generated_fallback",
    selected: null,
    fallbackUrl: next.fallbackUrl,
    diagnostics: [...current.diagnostics, ...next.diagnostics],
    retryable: current.retryable || next.retryable,
  };
}

function conciseFailure(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return `image_backfill_error: ${message}`.replace(/\s+/g, " ").slice(0, 120);
}

/**
 * Dry-runs and pre-network exits never consume cadence. Applied source runs
 * finish with the real execution/availability outcome.
 */
export function planSourceLeaseSettlement(input: {
  apply: boolean;
  networkStarted: boolean;
  runError: unknown | null;
  availabilityFailures: number;
  healthyResponses: number;
}): SourceLeaseSettlement {
  if (!input.apply || !input.networkStarted) return { action: "release" };
  if (input.runError !== null) {
    return { action: "finish", ok: false, failureClass: conciseFailure(input.runError) };
  }
  if (input.availabilityFailures > 0 && input.healthyResponses === 0) {
    return {
      action: "finish",
      ok: false,
      failureClass: `every observable official response failed (${input.availabilityFailures} failures)`,
    };
  }
  return { action: "finish", ok: true, failureClass: null };
}

type BackfillRow = {
  id: string;
  slug: string;
  title: string;
  prize_name: string;
  prize_category: string | null;
  sponsor_name: string | null;
  entry_url: string | null;
  official_rules_url: string | null;
  main_image_url: string | null;
  category_fallback_image: string | null;
  listing_ingestion: { official_source_url: string | null } | Array<{ official_source_url: string | null }> | null;
};

async function run(argv = process.argv.slice(2)) {
  const apply = argv.includes("--apply");
  const fallbackOnly = argv.includes("--fallback-only");
  const retryFallbacks = argv.includes("--retry-fallbacks");
  const limit = Math.max(1, Math.min(100, Number.parseInt(flagValue(argv, "--limit") ?? "25", 10) || 25));
  const after = flagValue(argv, "--after");
  assertApprovedBackfillMode(fallbackOnly);
  const { url, key } = requireSweepzaBackfillProvider();

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const stats = {
    examined: 0,
    recovered: 0,
    sourceImages: 0,
    sponsorAssets: 0,
    generatedFallbacks: 0,
    permanentFailures: 0,
    skippedSuccessful: 0,
    failureReasons: new Map<string, number>(),
  };

  function countFailure(reason: string) {
    stats.failureReasons.set(reason, (stats.failureReasons.get(reason) ?? 0) + 1);
  }

  function fallbackResult(row: BackfillRow, reason: string): ListingImagePipelineResult {
    const diagnostic: ImageCandidateDiagnostic = {
      url: row.entry_url ?? row.official_rules_url ?? "unavailable",
      method: "dom_hero",
      score: 0,
      role: "primary",
      rightsStatus: "unknown",
      status: "rejected",
      rejectionReason: reason,
      httpStatus: null,
      finalUrl: null,
      validation: null,
      storageStatus: "not_attempted",
    };
    return {
      finalStatus: "generated_fallback",
      selected: null,
      fallbackUrl: listingFallbackImageUrl(row.prize_category),
      diagnostics: [diagnostic],
      retryable: false,
    };
  }

  async function latestAttempt(listingId: string): Promise<{
    finalStatus: string;
    retryable: boolean;
  } | null> {
    const { data, error } = await supabase
      .from("listing_image_attempt")
      .select("final_status, retryable")
      .eq("listing_id", listingId)
      .order("processed_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ final_status: string; retryable: boolean }>();
    if (error) throw new Error(`image-attempt lookup failed for ${listingId}: ${error.message}`);
    return data ? { finalStatus: data.final_status, retryable: data.retryable } : null;
  }

  async function persistResult(row: BackfillRow, sourcePageUrl: string, result: ListingImagePipelineResult) {
    if (!apply) return;
    const { error } = await supabase.rpc("finalize_listing_image", {
      p_listing_id: row.id,
      p_result: {
        sourcePageUrl,
        finalStatus: result.finalStatus,
        fallbackUrl: result.fallbackUrl,
        selected: result.selected,
        diagnostics: result.diagnostics,
        retryable: result.retryable,
        processedAt: new Date().toISOString(),
      },
    });
    if (error) throw new Error(`finalize ${row.slug}: ${error.message}`);
  }

  let query = supabase
    .from("listing")
    .select("id, slug, title, prize_name, prize_category, sponsor_name, entry_url, official_rules_url, main_image_url, category_fallback_image, listing_ingestion(official_source_url)")
    .is("main_image_url", null)
    .order("id", { ascending: true })
    .limit(limit);
  if (after) query = query.gt("id", after);

  const { data, error } = await query;
  if (error) throw new Error(`listing lookup failed: ${error.message}`);
  const rows = (data ?? []) as unknown as BackfillRow[];
  if (rows.length === 0) {
    console.log("No image-less listings matched this batch.");
    return;
  }

  // Network-capable imports stay delayed until provider identity is validated.
  const [
    { getSourceDescriptor },
    { evaluateSourceGate },
    { createSourceHttpClient, isRetryable, isRetryableOnLaterRun },
    { discoverImageCandidates },
    { processListingImage },
  ] = await Promise.all([
    import("@/lib/ingestion/source"),
    import("@/lib/ingestion/gate"),
    import("@/lib/ingestion/http"),
    import("@/lib/ingestion/image-candidates"),
    import("@/lib/ingestion/image-pipeline"),
  ]);

  let http: ReturnType<typeof createSourceHttpClient> | null = null;
  let leaseToken: string | null = null;
  let networkStarted = false;
  let runError: unknown | null = null;
  let settlementError: unknown | null = null;
  let availabilityFailures = 0;
  let healthyResponses = 0;
  const descriptor = getSourceDescriptor("official_direct");

  const settleSourceLease = async () => {
    if (!leaseToken) return;
    const settlement = planSourceLeaseSettlement({
      apply,
      networkStarted,
      runError,
      availabilityFailures,
      healthyResponses,
    });
    if (settlement.action === "release") {
      const { data: released, error: releaseError } = await supabase.rpc("release_source_run_lease", {
        p_source_id: "official_direct",
        p_token: leaseToken,
      });
      if (releaseError) throw new Error(`source lease release failed: ${releaseError.message}`);
      if (released !== true) throw new Error("source lease release failed: stale lease");
      return;
    }

    const { data: finished, error: finishError } = await supabase.rpc("finish_source_run_lease", {
      p_source_id: "official_direct",
      p_token: leaseToken,
      p_ok: settlement.ok,
      p_failure_class: settlement.failureClass,
      p_failure_threshold: descriptor?.failureThreshold ?? 5,
    });
    if (finishError) throw new Error(`source lease finish failed: ${finishError.message}`);
    const outcome = finished as { ok?: boolean; error?: string } | null;
    if (!outcome?.ok) {
      throw new Error(`source lease finish failed: ${outcome?.error ?? "invalid_result"}`);
    }
  };

  try {
    if (!fallbackOnly) {
      const { data: record, error: recordError } = await supabase
        .from("source_registry")
        .select("id, compliance_state, kill_switch, circuit_opened_at, last_run_at")
        .eq("id", "official_direct")
        .maybeSingle();
      if (recordError) throw new Error(`source gate lookup failed: ${recordError.message}`);
      const decision = evaluateSourceGate({
        descriptor,
        record: record ? {
          id: record.id,
          complianceState: record.compliance_state,
          killSwitch: record.kill_switch,
          circuitOpenedAt: record.circuit_opened_at,
          lastRunAt: record.last_run_at,
        } : null,
        ingestionEnabled: process.env.INGESTION_ENABLED,
      });
      if (!decision.allowed) {
        throw new Error(`source image backfill gate refused: ${decision.reason} — ${decision.detail}`);
      }

      const { data: lease, error: leaseError } = await supabase.rpc("acquire_source_run_lease", {
        p_source_id: "official_direct",
        p_refresh_interval_minutes: descriptor?.refreshIntervalMinutes ?? 1440,
        p_lease_seconds: SOURCE_BACKFILL_LEASE_SECONDS,
      });
      if (leaseError) throw new Error(`source lease acquisition failed: ${leaseError.message}`);
      if (!lease?.ok || !lease.token) {
        throw new Error(`source lease refused: ${lease?.error ?? "invalid_result"}`);
      }
      leaseToken = lease.token;
      http = createSourceHttpClient(decision.descriptor);
    }

    for (const row of rows) {
      stats.examined += 1;
      const previous = await latestAttempt(row.id);
      if (shouldSkipExistingAttempt(previous, retryFallbacks)) {
        stats.skippedSuccessful += 1;
        console.log(`skip ${row.slug}: already ${previous?.finalStatus}`);
        continue;
      }

      let result: ListingImagePipelineResult;
      let sourcePageUrl = row.entry_url ?? row.official_rules_url ?? "unavailable";
      if (fallbackOnly) {
        result = fallbackResult(row, "source_network_not_activated");
      } else {
        const ingestion = Array.isArray(row.listing_ingestion)
          ? row.listing_ingestion[0]
          : row.listing_ingestion;
        const candidates = [
          row.entry_url,
          ingestion?.official_source_url,
          row.official_rules_url,
        ].filter((value, index, all): value is string => Boolean(value) && all.indexOf(value) === index);

        let candidatePageResult: ListingImagePipelineResult | null = null;
        for (const candidatePage of candidates) {
          sourcePageUrl = candidatePage;
          networkStarted = true;
          const fetched = await http!.get(candidatePage, { persistFetchState: false });
          const availabilityFailure = fetched.status === "failed" && isRetryable(fetched.failure);
          const retryableFetchFailure = fetched.status === "failed" && isRetryableOnLaterRun(fetched.failure);
          if (fetched.status === "failed") {
            if (availabilityFailure) {
              availabilityFailures += 1;
            }
          } else {
            healthyResponses += 1;
          }
          if (fetched.status !== "ok") {
            const reason = fetched.status === "failed" ? `source_fetch_${fetched.failure}` : "source_not_modified_without_cached_html";
            const fetchResult = fallbackResult(row, reason);
            fetchResult.retryable = retryableFetchFailure;
            fetchResult.diagnostics[0] = {
              ...fallbackResult(row, reason).diagnostics[0],
              url: candidatePage,
              httpStatus: fetched.status === "failed" ? fetched.httpStatus : 304,
            };
            candidatePageResult = accumulateCandidatePageResult(candidatePageResult, fetchResult);
            continue;
          }

          const discovery = discoverImageCandidates(fetched.body, fetched.finalUrl);
          const pageResult = await processListingImage({
            discovery,
            prizeCategory: row.prize_category,
            prizeName: row.prize_name,
            http: http!,
            storage: {
              store: () => Promise.reject(new Error(
                "listing media storage is not configured",
              )),
            },
          });
          candidatePageResult = accumulateCandidatePageResult(candidatePageResult, pageResult);
          sourcePageUrl = fetched.finalUrl;
          if (candidatePageResult.finalStatus !== "generated_fallback") break;
        }
        result = candidatePageResult ?? fallbackResult(row, "source_page_unavailable");
      }

      await persistResult(row, sourcePageUrl, result);
      if (result.finalStatus === "source_image") {
        stats.recovered += 1;
        stats.sourceImages += 1;
      } else if (result.finalStatus === "sponsor_asset") {
        stats.recovered += 1;
        stats.sponsorAssets += 1;
      } else if (result.finalStatus === "generated_fallback") {
        stats.generatedFallbacks += 1;
        for (const item of result.diagnostics) {
          if (item.rejectionReason) countFailure(item.rejectionReason);
        }
      } else {
        stats.permanentFailures += 1;
      }
      console.log(`${apply ? "updated" : "[dry-run]"} ${row.slug}: ${result.finalStatus}`);
    }
  } catch (error) {
    runError = error;
  } finally {
    try {
      await settleSourceLease();
    } catch (cleanupError) {
      if (runError === null) {
        settlementError = cleanupError;
      } else {
        console.error(
          `Source lease cleanup also failed: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`,
        );
      }
    }
  }

  if (runError !== null) throw runError;
  if (settlementError !== null) throw settlementError;

  console.log(JSON.stringify({
    mode: apply ? "apply" : "dry-run",
    fallbackOnly,
    batch: { limit, after, nextAfter: rows.at(-1)?.id ?? null },
    listingsExamined: stats.examined,
    imagesRecovered: stats.recovered,
    listingsUsingSourceImages: stats.sourceImages,
    listingsUsingSponsorAssets: stats.sponsorAssets,
    listingsUsingGeneratedFallbacks: stats.generatedFallbacks,
    permanentFailures: stats.permanentFailures,
    skippedSuccessful: stats.skippedSuccessful,
    failureReasons: Object.fromEntries([...stats.failureReasons.entries()].sort()),
  }, null, 2));
}

const invokedPath = process.argv[1];
if (invokedPath && import.meta.url === pathToFileURL(invokedPath).href) {
  run().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
