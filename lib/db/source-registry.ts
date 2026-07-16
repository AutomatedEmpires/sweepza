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
 * Move a source along the compliance ladder, recording the decision. Refuses
 * illegal transitions (the state machine is the authority, not the caller) and
 * writes the audit event before the state change so a failed write can never
 * leave an unexplained approval.
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

  const { error: eventError } = await supabase.from("source_approval_event").insert({
    source_id: input.sourceId,
    from_state: current.complianceState,
    to_state: input.to,
    actor,
    reason: input.reason ?? null,
  });
  if (eventError) {
    return { ok: false, error: `Could not record the decision: ${eventError.message}` };
  }

  const approving = input.to === "approved_for_production";
  const { data, error } = await supabase
    .from("source_registry")
    .update({
      compliance_state: input.to,
      // Approval attribution reflects the live production grant specifically —
      // it is cleared on the way down so a paused source never displays as
      // "approved by X" while it is not, in fact, approved.
      approved_by: approving ? actor : null,
      approved_at: approving ? new Date().toISOString() : null,
    })
    .eq("id", input.sourceId)
    .select(COLUMNS)
    .single<SourceRegistryRow>();

  if (error) return { ok: false, error: `Could not update the source: ${error.message}` };
  return { ok: true, record: toRecord(data) };
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

/**
 * Record the outcome of a run for circuit-breaker accounting. A success resets
 * the counter and closes the breaker; a failure increments it and trips the
 * breaker once the source's threshold is reached.
 */
export async function recordRunOutcome(
  sourceId: string,
  outcome: { ok: boolean; failureClass?: string | null; failureThreshold: number },
): Promise<void> {
  const supabase = createServiceRoleClient();
  const now = new Date().toISOString();

  if (outcome.ok) {
    const { error } = await supabase
      .from("source_registry")
      .update({
        last_run_at: now,
        last_success_at: now,
        consecutive_failures: 0,
        circuit_opened_at: null,
        last_failure_class: null,
      })
      .eq("id", sourceId);
    if (error) throw new Error(`recordRunOutcome failed: ${error.message}`);
    return;
  }

  const current = await getSourceRecord(sourceId);
  const failures = (current?.consecutiveFailures ?? 0) + 1;
  const tripped = failures >= outcome.failureThreshold;

  const { error } = await supabase
    .from("source_registry")
    .update({
      last_run_at: now,
      last_failure_at: now,
      last_failure_class: outcome.failureClass ?? null,
      consecutive_failures: failures,
      // Keep the original trip time if the breaker is already open — the age of
      // the outage is what an operator needs, not the age of the latest retry.
      circuit_opened_at: tripped ? (current?.circuitOpenedAt ?? now) : null,
    })
    .eq("id", sourceId);
  if (error) throw new Error(`recordRunOutcome failed: ${error.message}`);
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
