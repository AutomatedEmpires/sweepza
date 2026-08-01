import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createServiceRoleClient: vi.fn(),
  evaluateSourceGate: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServiceRoleClient: mocks.createServiceRoleClient,
}));

vi.mock("@/lib/ingestion/gate", () => ({
  evaluateSourceGate: mocks.evaluateSourceGate,
  describeGateDecision: () => "ingestion_disabled: dark",
}));

import {
  getSourceHealth,
  summarizeIngestionReadiness,
  type SourceHealthRow,
  type SourceHealthView,
} from "@/lib/db/source-health";
import { SOURCE_REGISTRY } from "@/lib/ingestion/source";

const SOURCE_ID = SOURCE_REGISTRY[0].id;
const LAST_RUN = "2026-07-19T12:00:00.000Z";

function clientWith(options: {
  registry?: { data: unknown[] | null; error: unknown };
  runs?: { data: unknown[] | null; error: unknown };
  queue?: { data: unknown[] | null; error: unknown };
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
      if (table === "source_discovery_work_item") {
        return {
          select: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue(
              options.queue ?? { data: [], error: null },
            ),
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
    notes: "Automatic stale-run recovery",
    started_at: "2026-07-19T12:00:00.000Z",
    finished_at: "2026-07-19T12:01:00.000Z",
  };
}

function healthRow(
  id: string,
  tier: SourceHealthRow["tier"],
  policyReady: boolean,
): SourceHealthRow {
  return {
    id,
    label: id,
    tier,
    registryState: "approved_for_production",
    recordState: "approved_for_production",
    killSwitch: false,
    robotsPosture: "permissive",
    tosPosture: "permits_use",
    approvedBy: "operator",
    approvedAt: LAST_RUN,
    consecutiveFailures: 0,
    circuitOpenedAt: null,
    lastRunAt: LAST_RUN,
    lastSuccessAt: LAST_RUN,
    lastFailureClass: null,
    refreshIntervalMinutes: 720,
    requestBudgetPerRun: 25,
    gate: { allowed: policyReady, detail: policyReady ? "allowed" : "blocked" },
    policyReady,
    recentRuns: [],
  };
}

function healthView(
  overrides: Partial<SourceHealthView> = {},
): SourceHealthView {
  return {
    ingestionEnabled: true,
    tablesPresent: true,
    registryReadable: true,
    runsReadable: true,
    queueReadable: true,
    rows: [
      healthRow("official_direct", "official", true),
      healthRow("discovery_one", "discovery", true),
    ],
    ...overrides,
  };
}

describe("getSourceHealth", () => {
  beforeEach(() => {
    mocks.createServiceRoleClient.mockReset();
    mocks.evaluateSourceGate.mockReset();
    mocks.evaluateSourceGate.mockReturnValue({
      allowed: false,
      reason: "ingestion_disabled",
      detail: "dark",
    });
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
    expect(health.queueReadable).toBe(true);
    expect(health.rows.find((row) => row.id === SOURCE_ID)?.recentRuns).toHaveLength(1);
    expect(
      health.rows.find((row) => row.id === SOURCE_ID)?.recentRuns[0]?.notes,
    ).toBe("Automatic stale-run recovery");
  });

  it("fails closed to code policy when both migration-backed reads fail", async () => {
    mocks.createServiceRoleClient.mockReturnValue(clientWith({}));

    const health = await getSourceHealth();

    expect(health.tablesPresent).toBe(false);
    expect(health.registryReadable).toBe(false);
    expect(health.runsReadable).toBe(false);
    expect(health.queueReadable).toBe(true);
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

  it("fails operational readiness when the durable work queue is unreadable", async () => {
    mocks.createServiceRoleClient.mockReturnValue(
      clientWith({
        registry: { data: [registryRow()], error: null },
        runs: { data: [runRow()], error: null },
        queue: { data: null, error: { message: "queue unavailable" } },
      }),
    );

    const health = await getSourceHealth();

    expect(health.registryReadable).toBe(true);
    expect(health.runsReadable).toBe(true);
    expect(health.queueReadable).toBe(false);
    expect(health.tablesPresent).toBe(false);
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

  it("treats a healthy refresh wait as policy-ready", async () => {
    mocks.createServiceRoleClient.mockReturnValue(
      clientWith({
        registry: { data: [registryRow()], error: null },
        runs: { data: [], error: null },
      }),
    );
    mocks.evaluateSourceGate.mockImplementation((input) =>
      input.ingestionEnabled === "true"
        ? {
            allowed: false,
            reason: "refresh_not_due",
            detail: "waiting for reviewed cadence",
          }
        : { allowed: false, reason: "ingestion_disabled", detail: "dark" },
    );

    const health = await getSourceHealth();

    expect(health.rows.find((row) => row.id === SOURCE_ID)?.policyReady).toBe(true);
    expect(
      health.rows.filter((row) => row.id !== SOURCE_ID).every((row) => !row.policyReady),
    ).toBe(true);
    expect(mocks.evaluateSourceGate).toHaveBeenCalledWith(
      expect.objectContaining({ ingestionEnabled: "true" }),
    );
  });

  it("does not mask an unreadable cadence timestamp as ready", async () => {
    mocks.createServiceRoleClient.mockReturnValue(
      clientWith({
        registry: {
          data: [{ ...registryRow(), last_run_at: "not-a-timestamp" }],
          error: null,
        },
        runs: { data: [], error: null },
      }),
    );
    mocks.evaluateSourceGate.mockImplementation((input) =>
      input.ingestionEnabled === "true"
        ? {
            allowed: false,
            reason: "refresh_not_due",
            detail: "unreadable cadence timestamp",
          }
        : { allowed: false, reason: "ingestion_disabled", detail: "dark" },
    );

    const health = await getSourceHealth();

    expect(health.rows.find((row) => row.id === SOURCE_ID)?.policyReady).toBe(false);
  });
});

describe("summarizeIngestionReadiness", () => {
  it("is ready with readable operations data and an approved official intake lane", () => {
    expect(
      summarizeIngestionReadiness(healthView(), true, {
        readable: true,
        ready: true,
      }),
    ).toEqual({
      enabled: true,
      configured: true,
      ready: true,
      operationalDataReadable: true,
      officialSourceReady: true,
      directOfficialIntakeReady: true,
      eligibleDiscoverySources: 1,
      blockers: [],
    });
  });

  it("fails closed with actionable generic blockers", () => {
    const health = healthView({
      tablesPresent: false,
      rows: [
        healthRow("official_direct", "official", false),
        healthRow("discovery_one", "discovery", false),
      ],
    });

    expect(
      summarizeIngestionReadiness(health, false, {
        readable: true,
        ready: true,
      }),
    ).toEqual({
      enabled: true,
      configured: false,
      ready: false,
      operationalDataReadable: false,
      officialSourceReady: false,
      directOfficialIntakeReady: false,
      eligibleDiscoverySources: 0,
      blockers: [
        "configuration_incomplete",
        "operational_data_unreadable",
        "official_source_not_ready",
      ],
    });
  });

  it("is ready with the authenticated direct-intake lane even when no directory source is approved", () => {
    const health = healthView({
      rows: [healthRow("official_direct", "official", true)],
    });

    expect(
      summarizeIngestionReadiness(health, true, {
        readable: true,
        ready: true,
      }),
    ).toEqual({
      enabled: true,
      configured: true,
      ready: true,
      operationalDataReadable: true,
      officialSourceReady: true,
      directOfficialIntakeReady: true,
      eligibleDiscoverySources: 0,
      blockers: [],
    });
  });

  it("requires at least one currently approved official destination", () => {
    expect(
      summarizeIngestionReadiness(healthView(), true, {
        readable: true,
        ready: false,
      }),
    ).toEqual({
      enabled: true,
      configured: true,
      ready: false,
      operationalDataReadable: true,
      officialSourceReady: false,
      directOfficialIntakeReady: false,
      eligibleDiscoverySources: 1,
      blockers: ["official_source_not_ready"],
    });
  });

  it("fails closed when official destination authority is unreadable", () => {
    const readiness = summarizeIngestionReadiness(healthView(), true, {
      readable: false,
      ready: false,
    });

    expect(readiness.ready).toBe(false);
    expect(readiness.operationalDataReadable).toBe(false);
    expect(readiness.officialSourceReady).toBe(false);
    expect(readiness.directOfficialIntakeReady).toBe(false);
    expect(readiness.blockers).toEqual([
      "operational_data_unreadable",
      "official_source_not_ready",
    ]);
  });
});
