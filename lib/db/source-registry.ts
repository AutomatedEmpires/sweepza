import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/server";
import {
  canTransition,
  isComplianceState,
  type SourceComplianceState,
} from "@/lib/ingestion/compliance";

// Data layer for the source compliance registry. The approval decision lives in
// the database (not in code) so that turning a source on is an auditable act by
// a named person at a known time, and so revoking it never requires a deploy.

export interface SourceRegistryRecord {
  id: string;
  complianceState: SourceComplianceState;
  killSwitch: boolean;
  approvedBy: string | null;
  approvedAt: string | null;
  consecutiveFailures: number;
  circuitOpenedAt: string | null;
  lastRunAt: string | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastFailureClass: string | null;
  notes: string | null;
}

interface SourceRegistryRow {
  id: string;
  compliance_state: string;
  kill_switch: boolean;
  approved_by: string | null;
  approved_at: string | null;
  consecutive_failures: number;
  circuit_opened_at: string | null;
  last_run_at: string | null;
  last_success_at: string | null;
  last_failure_at: string | null;
  last_failure_class: string | null;
  notes: string | null;
}

/**
 * Map a row to the domain record. An unrecognized compliance_state degrades to
 * 'blocked' rather than throwing: an unknown state is not a reason to crash a
 * read, but it is absolutely a reason to refuse to execute.
 */
function toRecord(row: SourceRegistryRow): SourceRegistryRecord {
  return {
    id: row.id,
    complianceState: isComplianceState(row.compliance_state)
      ? row.compliance_state
      : "blocked",
    killSwitch: row.kill_switch,
    approvedBy: row.approved_by,
    approvedAt: row.approved_at,
    consecutiveFailures: row.consecutive_failures,
    circuitOpenedAt: row.circuit_opened_at,
    lastRunAt: row.last_run_at,
    lastSuccessAt: row.last_success_at,
    lastFailureAt: row.last_failure_at,
    lastFailureClass: row.last_failure_class,
    notes: row.notes,
  };
}

const COLUMNS =
  "id, compliance_state, kill_switch, approved_by, approved_at, consecutive_failures, circuit_opened_at, last_run_at, last_success_at, last_failure_at, last_failure_class, notes";

export async function listSourceRecords(): Promise<SourceRegistryRecord[]> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("source_registry")
    .select(COLUMNS)
    .order("id");
  if (error) throw new Error(`listSourceRecords failed: ${error.message}`);
  return ((data ?? []) as SourceRegistryRow[]).map(toRecord);
}

export async function getSourceRecord(id: string): Promise<SourceRegistryRecord | null> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("source_registry")
    .select(COLUMNS)
    .eq("id", id)
    .maybeSingle<SourceRegistryRow>();
  if (error) throw new Error(`getSourceRecord failed: ${error.message}`);
  return data ? toRecord(data) : null;
}

export interface TransitionInput {
  sourceId: string;
  to: SourceComplianceState;
  /** Who decided. Recorded verbatim in the append-only event log. */
  actor: string;
  reason?: string;
}

export type TransitionResult =
  | { ok: true; record: SourceRegistryRecord }
  | { ok: false; error: string };

/**
 * Move a source along the compliance ladder, recording the decision.
 *
 * The TypeScript state machine gives the operator an immediate explanation,
 * while the database independently enforces the same legal edges as the final
 * authority. The `transition_source_compliance` RPC locks the source row,
 * compare-and-sets on the state we validated against, derives approval
 * attribution, and writes the audit event + state change in one transaction.
 *
 * That split matters. This function used to insert the event and then update the
 * row as two independent writes, with a comment claiming the ordering meant "a
 * failed write can never leave an unexplained approval" — the exact opposite was
 * true: a failed update left the append-only log permanently asserting a
 * transition that never happened. An audit trail that lies is worse than none,
 * because it is trusted. The unlocked read-then-write also let two concurrent
 * transitions both validate the same from_state and write an illegal history.
 */
export async function transitionSourceCompliance(
  input: TransitionInput,
): Promise<TransitionResult> {
  const current = await getSourceRecord(input.sourceId);
  if (!current) return { ok: false, error: `Unknown source "${input.sourceId}".` };

  if (current.complianceState === input.to) {
    return { ok: false, error: `Source is already ${input.to}.` };
  }
  if (!canTransition(current.complianceState, input.to)) {
    return {
      ok: false,
      error: `Illegal transition ${current.complianceState} → ${input.to}.`,
    };
  }
  const actor = input.actor.trim();
  if (!actor) return { ok: false, error: "An actor is required to record an approval." };

  const supabase = createServiceRoleClient();

  const { data: outcome, error: rpcError } = await supabase.rpc(
    "transition_source_compliance",
    {
      p_source_id: input.sourceId,
      // The state legality was checked against — the CAS key. If the row moved
      // underneath us, the RPC refuses instead of writing a false history.
      p_from: current.complianceState,
      p_to: input.to,
      p_actor: actor,
      p_reason: input.reason ?? null,
    },
  );

  if (rpcError) {
    return { ok: false, error: `Could not record the decision: ${rpcError.message}` };
  }

  const result = outcome as { ok: boolean; error?: string; actual?: string } | null;
  if (!result?.ok) {
    if (result?.error === "stale_state") {
      return {
        ok: false,
        error: `Source moved to ${result.actual} while this decision was being made. Re-read it and decide again.`,
      };
    }
    if (result?.error === "unknown_source") {
      return { ok: false, error: `Unknown source "${input.sourceId}".` };
    }
    if (result?.error === "illegal_transition") {
      return { ok: false, error: `The database refused illegal transition ${current.complianceState} → ${input.to}.` };
    }
    if (result?.error === "actor_required") {
      return { ok: false, error: "An actor is required to record an approval." };
    }
    return { ok: false, error: `Could not update the source: ${result?.error ?? "unknown"}` };
  }

  const record = await getSourceRecord(input.sourceId);
  if (!record) {
    return { ok: false, error: `Source "${input.sourceId}" vanished after the transition.` };
  }
  return { ok: true, record };
}

export interface ApprovalEvent {
  id: string;
  sourceId: string;
  fromState: SourceComplianceState | null;
  toState: SourceComplianceState;
  actor: string;
  reason: string | null;
  createdAt: string;
}

export async function listApprovalEvents(
  sourceId: string,
  limit = 50,
): Promise<ApprovalEvent[]> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("source_approval_event")
    .select("id, source_id, from_state, to_state, actor, reason, created_at")
    .eq("source_id", sourceId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`listApprovalEvents failed: ${error.message}`);
  return (data ?? []).map((row) => {
    const e = row as {
      id: string;
      source_id: string;
      from_state: string | null;
      to_state: string;
      actor: string;
      reason: string | null;
      created_at: string;
    };
    return {
      id: e.id,
      sourceId: e.source_id,
      fromState: isComplianceState(e.from_state) ? e.from_state : null,
      toState: isComplianceState(e.to_state) ? e.to_state : "blocked",
      actor: e.actor,
      reason: e.reason,
      createdAt: e.created_at,
    };
  });
}

/** Flip the code-independent kill switch. Reversible; leaves history intact. */
export async function setSourceKillSwitch(
  sourceId: string,
  killSwitch: boolean,
): Promise<void> {
  const supabase = createServiceRoleClient();
  const { error } = await supabase
    .from("source_registry")
    .update({ kill_switch: killSwitch })
    .eq("id", sourceId);
  if (error) throw new Error(`setSourceKillSwitch failed: ${error.message}`);
}

export type SourceRunLeaseResult =
  | { ok: true; token: string; startedAt: string; expiresAt: string }
  | { ok: false; error: string; detail?: string };

/**
 * Atomically acquire the database-authoritative run slot. The pure gate still
 * fails early and explains static policy, but this locked RPC is what prevents
 * two serverless invocations from both passing a stale read and crawling.
 */
export async function acquireSourceRunLease(
  sourceId: string,
  refreshIntervalMinutes: number,
): Promise<SourceRunLeaseResult> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase.rpc("acquire_source_run_lease", {
    p_source_id: sourceId,
    p_refresh_interval_minutes: refreshIntervalMinutes,
    p_lease_seconds: 600,
  });
  if (error) throw new Error(`acquireSourceRunLease failed: ${error.message}`);
  const result = data as {
    ok?: boolean;
    token?: string;
    started_at?: string;
    expires_at?: string;
    error?: string;
    next_run_at?: string;
  } | null;
  if (result?.ok && result.token && result.started_at && result.expires_at) {
    return {
      ok: true,
      token: result.token,
      startedAt: result.started_at,
      expiresAt: result.expires_at,
    };
  }
  return {
    ok: false,
    error: result?.error ?? "invalid_result",
    detail: result?.next_run_at ?? result?.expires_at,
  };
}

/** Finish only the matching, unexpired lease and update breaker health. */
export async function finishSourceRunLease(
  sourceId: string,
  token: string,
  outcome: { ok: boolean; failureClass?: string | null; failureThreshold: number },
): Promise<void> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase.rpc("finish_source_run_lease", {
    p_source_id: sourceId,
    p_token: token,
    p_ok: outcome.ok,
    p_failure_class: outcome.failureClass ?? null,
    p_failure_threshold: outcome.failureThreshold,
  });
  if (error) throw new Error(`finishSourceRunLease failed: ${error.message}`);
  const result = data as { ok?: boolean; error?: string } | null;
  if (!result?.ok) {
    throw new Error(`finishSourceRunLease failed: ${result?.error ?? "invalid_result"}`);
  }
}

/** Abandon a pre-network lease without writing cadence or source health. */
export async function releaseSourceRunLease(sourceId: string, token: string): Promise<void> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase.rpc("release_source_run_lease", {
    p_source_id: sourceId,
    p_token: token,
  });
  if (error) throw new Error(`releaseSourceRunLease failed: ${error.message}`);
  if (data !== true) throw new Error(`releaseSourceRunLease failed: stale lease for "${sourceId}"`);
}

export type ResetSourceCircuitResult =
  | { ok: true; record: SourceRegistryRecord }
  | { ok: false; error: string };

/**
 * Recover an opened circuit through a narrow, audited database authority path.
 * Normal acquisition still blocks open circuits; only an explicit named
 * operator action with a reason can clear one.
 */
export async function resetSourceCircuit(input: {
  sourceId: string;
  actor: string;
  reason: string;
}): Promise<ResetSourceCircuitResult> {
  const actor = input.actor.trim();
  const reason = input.reason.trim();
  if (!actor) return { ok: false, error: "An actor is required to reset a circuit." };
  if (!reason) return { ok: false, error: "A reason is required to reset a circuit." };

  const supabase = createServiceRoleClient();
  const { data, error } = await supabase.rpc("reset_source_circuit", {
    p_source_id: input.sourceId,
    p_actor: actor,
    p_reason: reason,
  });
  if (error) return { ok: false, error: `Could not reset the circuit: ${error.message}` };

  const result = data as { ok?: boolean; error?: string } | null;
  if (!result?.ok) {
    const detail = result?.error ?? "invalid_result";
    return { ok: false, error: `Could not reset the circuit: ${detail}` };
  }

  const record = await getSourceRecord(input.sourceId);
  if (!record) return { ok: false, error: `Source "${input.sourceId}" vanished after reset.` };
  return { ok: true, record };
}

export interface FetchStateRecord {
  etag: string | null;
  lastModified: string | null;
  contentHash: string | null;
  consecutiveFailures: number;
  lastChangedAt: string | null;
}

export async function getFetchState(
  sourceId: string,
  urlKey: string,
): Promise<FetchStateRecord | null> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("source_fetch_state")
    .select("etag, last_modified, content_hash, consecutive_failures, last_changed_at")
    .eq("source_id", sourceId)
    .eq("url_key", urlKey)
    .maybeSingle<{
      etag: string | null;
      last_modified: string | null;
      content_hash: string | null;
      consecutive_failures: number;
      last_changed_at: string | null;
    }>();
  if (error) throw new Error(`getFetchState failed: ${error.message}`);
  return data
    ? {
        etag: data.etag,
        lastModified: data.last_modified,
        contentHash: data.content_hash,
        consecutiveFailures: data.consecutive_failures,
        lastChangedAt: data.last_changed_at,
      }
    : null;
}

export async function saveFetchState(
  sourceId: string,
  urlKey: string,
  state: {
    etag?: string | null;
    lastModified?: string | null;
    contentHash?: string | null;
    lastStatus?: number | null;
    failureClass?: string | null;
    changed?: boolean;
    consecutiveFailures?: number;
  },
): Promise<void> {
  const supabase = createServiceRoleClient();
  const now = new Date().toISOString();
  const { error } = await supabase.from("source_fetch_state").upsert(
    {
      source_id: sourceId,
      url_key: urlKey,
      etag: state.etag ?? null,
      last_modified: state.lastModified ?? null,
      content_hash: state.contentHash ?? null,
      last_status: state.lastStatus ?? null,
      last_failure_class: state.failureClass ?? null,
      consecutive_failures: state.consecutiveFailures ?? 0,
      last_fetched_at: now,
      ...(state.changed ? { last_changed_at: now } : {}),
    },
    { onConflict: "source_id,url_key" },
  );
  if (error) throw new Error(`saveFetchState failed: ${error.message}`);
}
