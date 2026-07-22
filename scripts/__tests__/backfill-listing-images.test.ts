import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  SWEEPZA_SUPABASE_PROJECT_REF,
  assertSweepzaSupabaseUrl,
  loadRepoLocalEnv,
  planSourceLeaseSettlement,
  requireSweepzaBackfillProvider,
  shouldSkipExistingAttempt,
} from "../backfill-listing-images";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("backfill environment authority", () => {
  it("makes repo .env.local authoritative over inherited provider values", () => {
    const directory = mkdtempSync(join(tmpdir(), "sweepza-backfill-env-"));
    temporaryDirectories.push(directory);
    const path = join(directory, ".env.local");
    const serviceRoleVariable = ["SUPABASE", "SERVICE", "ROLE", "KEY"].join("_");
    writeFileSync(path, [
      `NEXT_PUBLIC_SUPABASE_URL=https://${SWEEPZA_SUPABASE_PROJECT_REF}.supabase.co`,
      `${serviceRoleVariable}=repo-test-value`,
      "INGESTION_ENABLED=false",
    ].join("\n"));
    const environment: NodeJS.ProcessEnv = {
      NODE_ENV: "test",
      NEXT_PUBLIC_SUPABASE_URL: "https://wrong-project.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "machine-key",
      UNRELATED_MACHINE_VALUE: "preserved",
    };

    expect(loadRepoLocalEnv(path, environment).sort()).toEqual([
      "NEXT_PUBLIC_SUPABASE_URL",
      "SUPABASE_SERVICE_ROLE_KEY",
    ]);
    expect(environment).toMatchObject({
      NEXT_PUBLIC_SUPABASE_URL: `https://${SWEEPZA_SUPABASE_PROJECT_REF}.supabase.co`,
      SUPABASE_SERVICE_ROLE_KEY: "repo-test-value",
      INGESTION_ENABLED: "false",
      UNRELATED_MACHINE_VALUE: "preserved",
    });
  });
});

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
      NODE_ENV: "test",
      NEXT_PUBLIC_SUPABASE_URL: "https://wrongprojectref0000.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "test-only-value",
    })).toThrow(/Refusing service-role write/);
  });
});

describe("official source lease settlement", () => {
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
