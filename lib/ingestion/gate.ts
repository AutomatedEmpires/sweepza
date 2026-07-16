import { isProductionExecutable, type SourceComplianceState } from "@/lib/ingestion/compliance";
import type { SourceDescriptor } from "@/lib/ingestion/source";

// The execution gate. Every path that could put ingestion on the live network
// asks this module first, and it answers with a REASON, not just a boolean —
// "why isn't this source running?" is the question an operator actually has,
// and a bare false cannot answer it.
//
// Four independent conditions must ALL hold before a source touches the
// network. They are deliberately owned by different people and stored in
// different places, so no single edit — by an engineer, an admin, or an agent —
// can turn ingestion on by itself:
//
//   1. INGESTION_ENABLED  — the founder's environment switch (Vercel env)
//   2. registry floor      — reviewed policy, in code (lib/ingestion/source.ts)
//   3. ToS posture         — a completed ToS review that permits our use
//   4. approval record     — the founder's audited decision, in the database
//
// Fixture execution requires none of these: it never leaves the process.

export type GateDenialReason =
  | "ingestion_disabled"
  | "unknown_source"
  | "registry_not_production_approved"
  | "tos_not_permitted"
  | "record_missing"
  | "record_not_production_approved"
  | "kill_switch"
  | "circuit_open";

export type GateDecision =
  | { allowed: true; descriptor: SourceDescriptor }
  | { allowed: false; reason: GateDenialReason; detail: string };

/** The subset of the DB record the gate reads. */
export interface SourceApprovalSnapshot {
  id: string;
  complianceState: SourceComplianceState;
  killSwitch: boolean;
  circuitOpenedAt: string | null;
}

export interface GateInput {
  descriptor: SourceDescriptor | undefined;
  record: SourceApprovalSnapshot | null;
  /** Raw value of env.INGESTION_ENABLED. Only the literal "true" enables. */
  ingestionEnabled: string | null | undefined;
}

/**
 * Decide whether one source may execute live. Pure: the caller supplies the
 * environment switch and the DB record, which keeps the rule unit-testable and
 * lets the admin surfaces explain a denial without re-running the check.
 */
export function evaluateSourceGate(input: GateInput): GateDecision {
  if (input.ingestionEnabled !== "true") {
    return {
      allowed: false,
      reason: "ingestion_disabled",
      detail:
        "INGESTION_ENABLED is not set to \"true\". Live ingestion is off for the whole deployment.",
    };
  }

  const descriptor = input.descriptor;
  if (!descriptor) {
    return {
      allowed: false,
      reason: "unknown_source",
      detail: "No registry descriptor exists for this source.",
    };
  }

  if (descriptor.killSwitch) {
    return {
      allowed: false,
      reason: "kill_switch",
      detail: `Source "${descriptor.id}" has its code-level kill switch engaged.`,
    };
  }

  if (!isProductionExecutable(descriptor.complianceState)) {
    return {
      allowed: false,
      reason: "registry_not_production_approved",
      detail: `Registry policy for "${descriptor.id}" is ${descriptor.complianceState}, not approved_for_production.`,
    };
  }

  // ToS is an INDEPENDENT condition, not a footnote of the compliance ladder.
  // SourceDescriptor states that an unreviewed source cannot reach production,
  // but nothing enforced it: a descriptor sitting at approved_for_production
  // with tosPosture "unreviewed" — or outright "prohibits_use" — executed. Fail
  // closed on an allowlist of one, so a posture added later denies by default
  // instead of silently permitting.
  if (descriptor.tosPosture !== "permits_use") {
    return {
      allowed: false,
      reason: "tos_not_permitted",
      detail:
        `Terms-of-service posture for "${descriptor.id}" is ${descriptor.tosPosture}, not permits_use. ` +
        `Only a completed ToS review that permits our use lets a source run live.`,
    };
  }

  const record = input.record;
  if (!record) {
    return {
      allowed: false,
      reason: "record_missing",
      detail: `No approval record exists for "${descriptor.id}". An approval must be recorded before it can run.`,
    };
  }

  if (record.killSwitch) {
    return {
      allowed: false,
      reason: "kill_switch",
      detail: `Source "${descriptor.id}" has its operational kill switch engaged.`,
    };
  }

  if (!isProductionExecutable(record.complianceState)) {
    return {
      allowed: false,
      reason: "record_not_production_approved",
      detail: `Approval record for "${descriptor.id}" is ${record.complianceState}, not approved_for_production.`,
    };
  }

  if (record.circuitOpenedAt) {
    return {
      allowed: false,
      reason: "circuit_open",
      detail: `The circuit breaker for "${descriptor.id}" opened at ${record.circuitOpenedAt} after repeated failures. Resolve the failure and reset it before running.`,
    };
  }

  return { allowed: true, descriptor };
}

/** Convenience for call sites that just need the reason string. */
export function describeGateDecision(decision: GateDecision): string {
  return decision.allowed ? "allowed" : `${decision.reason}: ${decision.detail}`;
}
