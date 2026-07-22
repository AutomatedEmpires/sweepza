import { describe, expect, it } from "vitest";
import {
  SOURCE_BACKFILL_LEASE_SECONDS,
  SWEEPZA_SUPABASE_PROJECT_REF,
  accumulateCandidatePageResult,
  assertApprovedBackfillMode,
  assertSweepzaSupabaseUrl,
  planSourceLeaseSettlement,
  requireSweepzaBackfillProvider,
  shouldSkipExistingAttempt,
} from "../backfill-listing-images";
import type {
  ImageCandidateDiagnostic,
  ListingImagePipelineResult,
} from "../../lib/ingestion/image-pipeline";

describe("Sweepza project boundary", () => {
  it("accepts only the exact canonical hosted project URL", () => {
    expect(() => assertSweepzaSupabaseUrl(
      `https://${SWEEPZA_SUPABASE_PROJECT_REF}.supabase.co/`,
    )).not.toThrow();
  });

  it.each([
    "https://wrongprojectref0000.supabase.co",
    `http://${SWEEPZA_SUPABASE_PROJECT_REF}.supabase.co`,
    `https://${SWEEPZA_SUPABASE_PROJECT_REF}.supabase.co:8443`,
    `https://${SWEEPZA_SUPABASE_PROJECT_REF}.supabase.co/rest/v1`,
    "https://database.sweepza.com",
    "not-a-url",
  ])("refuses a privileged write URL outside the Sweepza project (%s)", (url) => {
    expect(() => assertSweepzaSupabaseUrl(url)).toThrow(/Refusing service-role write/);
  });

  it("refuses a wrong-project fallback-only dry-run before creating a client", () => {
    expect(() => requireSweepzaBackfillProvider({
      NEXT_PUBLIC_SUPABASE_URL: "https://wrongprojectref0000.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "test-only-value",
    })).toThrow(/Refusing service-role write/);
  });

  it("accepts the centralized server-only URL fallback for Sweepza", () => {
    expect(requireSweepzaBackfillProvider({
      SUPABASE_URL: `https://${SWEEPZA_SUPABASE_PROJECT_REF}.supabase.co`,
      SUPABASE_SERVICE_ROLE_KEY: "test-only-value",
    })).toEqual({
      url: `https://${SWEEPZA_SUPABASE_PROJECT_REF}.supabase.co`,
      key: "test-only-value",
    });
  });
});

describe("media provider gate", () => {
  it("allows intentional generated-fallback work", () => {
    expect(() => assertApprovedBackfillMode(true)).not.toThrow();
  });

  it("refuses source asset work while storage remains locked to none", () => {
    expect(() => assertApprovedBackfillMode(false)).toThrow(/no approved media storage provider/);
  });
});

describe("official source lease settlement", () => {
  it("uses the maximum lease duration supported by the source lease RPC", () => {
    expect(SOURCE_BACKFILL_LEASE_SECONDS).toBe(3600);
  });

  it("releases a dry-run lease even after network requests", () => {
    expect(planSourceLeaseSettlement({
      apply: false,
      networkStarted: true,
      runError: null,
      availabilityFailures: 0,
      healthyResponses: 2,
    })).toEqual({ action: "release" });
  });

  it("releases an applied lease when no source network request started", () => {
    expect(planSourceLeaseSettlement({
      apply: true,
      networkStarted: false,
      runError: new Error("setup failed"),
      availabilityFailures: 0,
      healthyResponses: 0,
    })).toEqual({ action: "release" });
  });

  it("finishes a successful applied source run as successful", () => {
    expect(planSourceLeaseSettlement({
      apply: true,
      networkStarted: true,
      runError: null,
      availabilityFailures: 1,
      healthyResponses: 1,
    })).toEqual({ action: "finish", ok: true, failureClass: null });
  });

  it("finishes an exception after network start as failed", () => {
    const outcome = planSourceLeaseSettlement({
      apply: true,
      networkStarted: true,
      runError: new Error("storage\nwrite failed"),
      availabilityFailures: 0,
      healthyResponses: 1,
    });

    expect(outcome).toEqual({
      action: "finish",
      ok: false,
      failureClass: "image_backfill_error: storage write failed",
    });
  });

  it("finishes an all-outage applied source run as failed", () => {
    expect(planSourceLeaseSettlement({
      apply: true,
      networkStarted: true,
      runError: null,
      availabilityFailures: 3,
      healthyResponses: 0,
    })).toEqual({
      action: "finish",
      ok: false,
      failureClass: "every observable official response failed (3 failures)",
    });
  });
});

function pageDiagnostic(url: string, rejectionReason: string): ImageCandidateDiagnostic {
  return {
    url,
    method: "dom_hero",
    score: 0,
    role: "primary",
    rightsStatus: "unknown",
    status: "rejected",
    rejectionReason,
    httpStatus: null,
    finalUrl: null,
    validation: null,
    storageStatus: "not_attempted",
  };
}

function pageFallback(
  url: string,
  rejectionReason: string,
  retryable: boolean,
): ListingImagePipelineResult {
  return {
    finalStatus: "generated_fallback",
    selected: null,
    fallbackUrl: "/api/images/listing-fallback/other",
    diagnostics: [pageDiagnostic(url, rejectionReason)],
    retryable,
  };
}

describe("candidate page result accumulation", () => {
  it("retains diagnostics from every fallback page and ORs retryability", () => {
    const first = pageFallback("https://example.com/entry", "no_permitted_candidate", false);
    const second = pageFallback("https://example.com/rules", "source_fetch_timeout", true);

    const result = accumulateCandidatePageResult(
      accumulateCandidatePageResult(null, first),
      second,
    );

    expect(result).toEqual({
      finalStatus: "generated_fallback",
      selected: null,
      fallbackUrl: "/api/images/listing-fallback/other",
      diagnostics: [first.diagnostics[0], second.diagnostics[0]],
      retryable: true,
    });
  });

  it("treats a selected image as terminal instead of downgrading it", () => {
    const selected = {
      finalStatus: "source_image",
      selected: {},
      fallbackUrl: null,
      diagnostics: [pageDiagnostic("https://example.com/image.jpg", "selected")],
      retryable: false,
    } as unknown as ListingImagePipelineResult;

    expect(accumulateCandidatePageResult(
      pageFallback("https://example.com/entry", "source_fetch_timeout", true),
      selected,
    )).toBe(selected);
    expect(accumulateCandidatePageResult(
      selected,
      pageFallback("https://example.com/rules", "no_permitted_candidate", false),
    )).toBe(selected);
  });
});

describe("retryable image attempts", () => {
  it("does not strand a retryable fallback behind the default skip policy", () => {
    expect(shouldSkipExistingAttempt({
      finalStatus: "generated_fallback",
      retryable: true,
    }, false)).toBe(false);
  });

  it("skips a terminal fallback unless the operator explicitly retries it", () => {
    const previous = { finalStatus: "generated_fallback", retryable: false };
    expect(shouldSkipExistingAttempt(previous, false)).toBe(true);
    expect(shouldSkipExistingAttempt(previous, true)).toBe(false);
  });
});
