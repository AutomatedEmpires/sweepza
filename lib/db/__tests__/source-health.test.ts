import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createServiceRoleClient: vi.fn(),
  evaluateSourceGate: vi.fn(() => ({ allowed: false as const, reason: "ingestion_disabled" as const, detail: "dark" })),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServiceRoleClient: mocks.createServiceRoleClient,
}));

vi.mock("@/lib/ingestion/gate", () => ({
  evaluateSourceGate: mocks.evaluateSourceGate,
  describeGateDecision: () => "ingestion_disabled: dark",
}));

import { getSourceHealth } from "@/lib/db/source-health";
import { SOURCE_REGISTRY } from "@/lib/ingestion/source";

const SOURCE_ID = SOURCE_REGISTRY[0].id;
const LAST_RUN = "2026-07-19T12:00:00.000Z";

function clientWith(options: {
  registry?: { data: unknown[] | null; error: unknown };
  runs?: { data: unknown[] | null; error: unknown };
}) {
  return {
    from(table: string) {
      if (table === "source_registry") {
        return {
          select: vi.fn().mockResolvedValue(
            options.registry ?? { data: null, error: { message: "registry unavailable" } },
          ),
        };
      }
      if (table === "ingestion_run") {
        return {
          select: vi.fn(() => ({
            order: vi.fn(() => ({
              limit: vi.fn().mockResolvedValue(
                options.runs ?? { data: null, error: { message: "runs unavailable" } },
              ),
            })),
          })),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
}

function registryRow() {
  return {
    id: SOURCE_ID,
    compliance_state: "approved_for_fixtures",
    kill_switch: false,
    approved_by: null,
    approved_at: null,
    consecutive_failures: 0,
    circuit_opened_at: null,
    last_run_at: LAST_RUN,
    last_success_at: null,
    last_failure_class: null,
  };
}

function runRow() {
  return {
    source: SOURCE_ID,
    status: "ok",
    gate_decision: "allowed",
    discovered: 2,
    created: 1,
    failed: 0,
    requests_made: 3,
    not_modified: 1,
    started_at: "2026-07-19T12:00:00.000Z",
    finished_at: "2026-07-19T12:01:00.000Z",
  };
}

describe("getSourceHealth", () => {
  beforeEach(() => {
    mocks.createServiceRoleClient.mockReset();
    mocks.evaluateSourceGate.mockClear();
  });

  it("reports both operational tables readable on full success", async () => {
    mocks.createServiceRoleClient.mockReturnValue(
      clientWith({
        registry: { data: [registryRow()], error: null },
        runs: { data: [runRow()], error: null },
      }),
    );

    const health = await getSourceHealth();

    expect(health.tablesPresent).toBe(true);
    expect(health.registryReadable).toBe(true);
    expect(health.runsReadable).toBe(true);
    expect(health.rows.find((row) => row.id === SOURCE_ID)?.recentRuns).toHaveLength(1);
  });

  it("fails closed to code policy when both migration-backed reads fail", async () => {
    mocks.createServiceRoleClient.mockReturnValue(clientWith({}));

    const health = await getSourceHealth();

    expect(health.tablesPresent).toBe(false);
    expect(health.registryReadable).toBe(false);
    expect(health.runsReadable).toBe(false);
    expect(health.rows.find((row) => row.id === SOURCE_ID)?.recordState).toBeNull();
    expect(mocks.evaluateSourceGate).toHaveBeenCalledWith(
      expect.objectContaining({ record: null }),
    );
  });

  it("preserves registry approvals when only run history fails", async () => {
    mocks.createServiceRoleClient.mockReturnValue(
      clientWith({ registry: { data: [registryRow()], error: null } }),
    );

    const health = await getSourceHealth();

    expect(health.registryReadable).toBe(true);
    expect(health.runsReadable).toBe(false);
    expect(health.tablesPresent).toBe(false);
    expect(health.rows.find((row) => row.id === SOURCE_ID)?.recordState).toBe(
      "approved_for_fixtures",
    );
  });

  it("preserves run history when only the registry read fails", async () => {
    mocks.createServiceRoleClient.mockReturnValue(
      clientWith({ runs: { data: [runRow()], error: null } }),
    );

    const health = await getSourceHealth();

    expect(health.registryReadable).toBe(false);
    expect(health.runsReadable).toBe(true);
    expect(health.rows.find((row) => row.id === SOURCE_ID)?.recentRuns).toHaveLength(1);
  });

  it("passes last_run_at into the static gate cadence check", async () => {
    mocks.createServiceRoleClient.mockReturnValue(
      clientWith({
        registry: { data: [registryRow()], error: null },
        runs: { data: [], error: null },
      }),
    );

    await getSourceHealth();

    expect(mocks.evaluateSourceGate).toHaveBeenCalledWith(
      expect.objectContaining({
        record: expect.objectContaining({ id: SOURCE_ID, lastRunAt: LAST_RUN }),
      }),
    );
  });
});
