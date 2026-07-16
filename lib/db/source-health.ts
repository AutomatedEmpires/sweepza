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

// Source-health view for the admin operations console. Combines three things
// the founder needs in one place: the reviewed policy (descriptor), the actual
// approval decision (DB record), and recent run outcomes (ingestion_run), then
// runs the SAME gate the orchestrator uses so "would this run right now, and if
// not, why?" is answered on screen.
//
// Resilient by design: the source_registry / ingestion_run tables may not exist
// in an environment where the migrations have not been applied. A missing table
// degrades to "no data yet" rather than throwing — an admin console must render
// even before ingestion is provisioned.

export interface SourceRunStat {
  status: string;
  gateDecision: string | null;
  discovered: number;
  created: number;
  failed: number;
  requestsMade: number;
  notModified: number;
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
  recentRuns: SourceRunStat[];
}

export interface SourceHealthView {
  ingestionEnabled: boolean;
  /** True when the registry tables are readable (migrations applied). */
  tablesPresent: boolean;
  rows: SourceHealthRow[];
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
  started_at: string;
  finished_at: string | null;
}

/**
 * Assemble the health view. The DB reads are best-effort: any error (including a
 * missing table before migrations are applied) yields an empty result and
 * `tablesPresent: false`, so the console still renders the code-level policy.
 */
export async function getSourceHealth(): Promise<SourceHealthView> {
  const ingestionEnabled = env.INGESTION_ENABLED === "true";

  let records: RegistryRow[] = [];
  let runs: RunRow[] = [];
  let tablesPresent = true;

  try {
    const supabase = createServiceRoleClient();
    const [{ data: recData, error: recErr }, { data: runData, error: runErr }] =
      await Promise.all([
        supabase
          .from("source_registry")
          .select(
            "id, compliance_state, kill_switch, approved_by, approved_at, consecutive_failures, circuit_opened_at, last_run_at, last_success_at, last_failure_class",
          ),
        supabase
          .from("ingestion_run")
          .select(
            "source, status, gate_decision, discovered, created, failed, requests_made, not_modified, started_at, finished_at",
          )
          .order("started_at", { ascending: false })
          .limit(60),
      ]);
    if (recErr || runErr) {
      tablesPresent = false;
    } else {
      records = (recData ?? []) as RegistryRow[];
      runs = (runData ?? []) as RunRow[];
    }
  } catch {
    // Supabase not configured, or tables absent — render code-level policy only.
    tablesPresent = false;
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
        startedAt: run.started_at,
        finishedAt: run.finished_at,
      });
    }
    runsBySource.set(run.source, list);
  }

  const rows: SourceHealthRow[] = SOURCE_REGISTRY.map((descriptor) => {
    const record = recordById.get(descriptor.id) ?? null;
    const decision = evaluateSourceGate({
      descriptor,
      record: record
        ? {
            id: record.id,
            complianceState: record.compliance_state,
            killSwitch: record.kill_switch,
            circuitOpenedAt: record.circuit_opened_at,
          }
        : null,
      ingestionEnabled: env.INGESTION_ENABLED,
    });

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
      recentRuns: runsBySource.get(descriptor.id) ?? [],
    };
  });

  return { ingestionEnabled, tablesPresent, rows };
}

export function getDescriptorForDisplay(id: string): SourceDescriptor | undefined {
  return getSourceDescriptor(id);
}
