import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/server";
import { evaluateSourceGate, describeGateDecision } from "@/lib/ingestion/gate";
import {
  SOURCE_REGISTRY,
  getSourceDescriptor,
  type SourceDescriptor,
} from "@/lib/ingestion/source";
import { env } from "@/lib/env";
import type { SourceComplianceState } from "@/lib/ingestion/compliance";
import { getOfficialDestinationPolicyReadiness } from "@/lib/db/official-destination-policy";

// Source-health view for the admin operations console. Combines three things
// the founder needs in one place: the reviewed policy (descriptor), the actual
// approval decision (DB record), and recent run outcomes (ingestion_run), then
// runs the SAME gate the orchestrator uses so "would this run right now, and if
// not, why?" is answered on screen.
//
// Resilient by design: source_registry, ingestion_run, or the durable work queue
// may not exist in an environment where the migrations have not been applied.
// A missing table degrades to "no data yet" rather than throwing — an admin
// console must render even before ingestion is provisioned.

export interface SourceRunStat {
  status: string;
  gateDecision: string | null;
  discovered: number;
  created: number;
  failed: number;
  requestsMade: number;
  notModified: number;
  notes: string | null;
  startedAt: string;
  finishedAt: string | null;
}

export interface SourceHealthRow {
  id: string;
  label: string;
  tier: SourceDescriptor["tier"];
  registryState: SourceComplianceState;
  recordState: SourceComplianceState | null;
  killSwitch: boolean;
  robotsPosture: string;
  tosPosture: string;
  approvedBy: string | null;
  approvedAt: string | null;
  consecutiveFailures: number;
  circuitOpenedAt: string | null;
  lastRunAt: string | null;
  lastSuccessAt: string | null;
  lastFailureClass: string | null;
  refreshIntervalMinutes: number;
  requestBudgetPerRun: number;
  /** The live gate verdict for this source, right now. */
  gate: { allowed: boolean; detail: string };
  /**
   * Whether policy and operational approval would let this source execute when
   * the deployment switch is enabled. A healthy refresh wait still counts as
   * ready because it is cadence, not an operator action.
   */
  policyReady: boolean;
  recentRuns: SourceRunStat[];
}

export interface SourceHealthView {
  ingestionEnabled: boolean;
  /** True only when every ingestion control/audit table is readable. */
  tablesPresent: boolean;
  registryReadable: boolean;
  runsReadable: boolean;
  queueReadable: boolean;
  rows: SourceHealthRow[];
}

export type IngestionReadinessBlocker =
  | "disabled"
  | "configuration_incomplete"
  | "operational_data_unreadable"
  | "official_source_not_ready";

export interface IngestionReadiness {
  enabled: boolean;
  configured: boolean;
  ready: boolean;
  operationalDataReadable: boolean;
  officialSourceReady: boolean;
  directOfficialIntakeReady: boolean;
  eligibleDiscoverySources: number;
  blockers: IngestionReadinessBlocker[];
}

export interface OfficialDestinationReadinessSnapshot {
  readable: boolean;
  ready: boolean;
}

interface RegistryRow {
  id: string;
  compliance_state: SourceComplianceState;
  kill_switch: boolean;
  approved_by: string | null;
  approved_at: string | null;
  consecutive_failures: number;
  circuit_opened_at: string | null;
  last_run_at: string | null;
  last_success_at: string | null;
  last_failure_class: string | null;
}

interface RunRow {
  source: string;
  status: string;
  gate_decision: string | null;
  discovered: number;
  created: number;
  failed: number;
  requests_made: number | null;
  not_modified: number | null;
  notes: string | null;
  started_at: string;
  finished_at: string | null;
}

/**
 * Assemble the health view. Each DB read is best-effort and independent: a
 * missing/unreadable table never erases valid data from the other query. The
 * console still renders the fail-closed code policy when neither is readable.
 */
export async function getSourceHealth(): Promise<SourceHealthView> {
  const ingestionEnabled = env.INGESTION_ENABLED === "true";

  let records: RegistryRow[] = [];
  let runs: RunRow[] = [];
  let registryReadable = false;
  let runsReadable = false;
  let queueReadable = false;

  try {
    const supabase = createServiceRoleClient();
    try {
      const { data: recData, error: recErr } = await supabase
        .from("source_registry")
        .select(
          "id, compliance_state, kill_switch, approved_by, approved_at, consecutive_failures, circuit_opened_at, last_run_at, last_success_at, last_failure_class",
        );
      if (!recErr) {
        registryReadable = true;
        records = (recData ?? []) as RegistryRow[];
      }
    } catch {
      // Preserve run history when only the registry read fails.
    }

    try {
      const { data: runData, error: runErr } = await supabase
        .from("ingestion_run")
        .select(
          "source, status, gate_decision, discovered, created, failed, requests_made, not_modified, notes, started_at, finished_at",
        )
        .order("started_at", { ascending: false })
        .limit(60);
      if (!runErr) {
        runsReadable = true;
        runs = (runData ?? []) as RunRow[];
      }
    } catch {
      // Preserve registry approvals when only run history fails.
    }

    try {
      const { error: queueErr } = await supabase
        .from("source_discovery_work_item")
        .select("source_id")
        .limit(1);
      if (!queueErr) {
        queueReadable = true;
      }
    } catch {
      // A missing queue blocks every durable discovery/intake lane.
    }
  } catch {
    // Supabase not configured, or tables absent — render code-level policy only.
  }

  const recordById = new Map(records.map((r) => [r.id, r]));
  const runsBySource = new Map<string, SourceRunStat[]>();
  for (const run of runs) {
    const list = runsBySource.get(run.source) ?? [];
    if (list.length < 5) {
      list.push({
        status: run.status,
        gateDecision: run.gate_decision,
        discovered: run.discovered,
        created: run.created,
        failed: run.failed,
        requestsMade: run.requests_made ?? 0,
        notModified: run.not_modified ?? 0,
        notes: run.notes,
        startedAt: run.started_at,
        finishedAt: run.finished_at,
      });
    }
    runsBySource.set(run.source, list);
  }

  const rows: SourceHealthRow[] = SOURCE_REGISTRY.map((descriptor) => {
    const record = recordById.get(descriptor.id) ?? null;
    const approvalRecord = record
      ? {
          id: record.id,
          complianceState: record.compliance_state,
          killSwitch: record.kill_switch,
          circuitOpenedAt: record.circuit_opened_at,
          lastRunAt: record.last_run_at,
        }
      : null;
    const decision = evaluateSourceGate({
      descriptor,
      record: approvalRecord,
      ingestionEnabled: env.INGESTION_ENABLED,
    });
    const policyDecision = evaluateSourceGate({
      descriptor,
      record: approvalRecord,
      ingestionEnabled: "true",
    });
    const lastRunAt = approvalRecord?.lastRunAt;
    const healthyCadenceWait =
      !policyDecision.allowed &&
      policyDecision.reason === "refresh_not_due" &&
      typeof lastRunAt === "string" &&
      !Number.isNaN(Date.parse(lastRunAt));
    const policyReady =
      policyDecision.allowed || healthyCadenceWait;

    return {
      id: descriptor.id,
      label: descriptor.label,
      tier: descriptor.tier,
      registryState: descriptor.complianceState,
      recordState: record?.compliance_state ?? null,
      killSwitch: descriptor.killSwitch || Boolean(record?.kill_switch),
      robotsPosture: descriptor.robotsPosture,
      tosPosture: descriptor.tosPosture,
      approvedBy: record?.approved_by ?? null,
      approvedAt: record?.approved_at ?? null,
      consecutiveFailures: record?.consecutive_failures ?? 0,
      circuitOpenedAt: record?.circuit_opened_at ?? null,
      lastRunAt: record?.last_run_at ?? null,
      lastSuccessAt: record?.last_success_at ?? null,
      lastFailureClass: record?.last_failure_class ?? null,
      refreshIntervalMinutes: descriptor.refreshIntervalMinutes,
      requestBudgetPerRun: descriptor.requestBudgetPerRun,
      gate: { allowed: decision.allowed, detail: describeGateDecision(decision) },
      policyReady,
      recentRuns: runsBySource.get(descriptor.id) ?? [],
    };
  });

  return {
    ingestionEnabled,
    tablesPresent: registryReadable && runsReadable && queueReadable,
    registryReadable,
    runsReadable,
    queueReadable,
    rows,
  };
}

export function summarizeIngestionReadiness(
  health: SourceHealthView,
  configured: boolean,
  officialDestinations: OfficialDestinationReadinessSnapshot,
): IngestionReadiness {
  const operationalDataReadable =
    health.tablesPresent && officialDestinations.readable;
  const officialSourceReady =
    officialDestinations.readable &&
    officialDestinations.ready &&
    health.rows.some(
      (row) => row.id === "official_direct" && row.policyReady,
    );
  const directOfficialIntakeReady =
    operationalDataReadable && officialSourceReady;
  const eligibleDiscoverySources = health.rows.filter(
    (row) => row.tier === "discovery" && row.policyReady,
  ).length;
  const blockers: IngestionReadinessBlocker[] = [];

  if (!health.ingestionEnabled) blockers.push("disabled");
  if (!configured) blockers.push("configuration_incomplete");
  if (!operationalDataReadable) blockers.push("operational_data_unreadable");
  if (!officialSourceReady) blockers.push("official_source_not_ready");

  return {
    enabled: health.ingestionEnabled,
    configured,
    ready: blockers.length === 0,
    operationalDataReadable,
    officialSourceReady,
    directOfficialIntakeReady,
    eligibleDiscoverySources,
    blockers,
  };
}

export async function getIngestionReadiness(): Promise<IngestionReadiness> {
  const health = await getSourceHealth();
  const configured = Boolean(
    env.NEXT_PUBLIC_SUPABASE_URL &&
      env.SUPABASE_SERVICE_ROLE_KEY &&
      env.CRON_SECRET &&
      env.ANTHROPIC_API_KEY,
  );

  let officialDestinations: OfficialDestinationReadinessSnapshot = {
    readable: false,
    ready: false,
  };
  try {
    const destinationReadiness =
      await getOfficialDestinationPolicyReadiness();
    officialDestinations = {
      readable: true,
      ready: destinationReadiness.ready,
    };
  } catch {
    // An unreadable policy authority can never be reinterpreted as permission.
  }

  return summarizeIngestionReadiness(
    health,
    configured,
    officialDestinations,
  );
}

export function getDescriptorForDisplay(id: string): SourceDescriptor | undefined {
  return getSourceDescriptor(id);
}
