import { isProductionExecutable, type SourceComplianceState } from "@/lib/ingestion/compliance";
import {
  descriptorIneligibility,
  type DescriptorIneligibility,
  type SourceDescriptor,
} from "@/lib/ingestion/source";

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
  | "circuit_open"
  | "refresh_not_due"
  | "record_mismatch"
  | "robots_not_permitted";

export type GateDecision =
  | { allowed: true; descriptor: SourceDescriptor }
  | { allowed: false; reason: GateDenialReason; detail: string };

/** The subset of the DB record the gate reads. */
export interface SourceApprovalSnapshot {
  id: string;
  complianceState: SourceComplianceState;
  killSwitch: boolean;
  circuitOpenedAt: string | null;
  /** When this source last ran; enforces the descriptor's refresh interval. */
  lastRunAt?: string | null;
}

export interface GateInput {
  descriptor: SourceDescriptor | undefined;
  record: SourceApprovalSnapshot | null;
  /** Raw value of env.INGESTION_ENABLED. Only the literal "true" enables. */
  ingestionEnabled: string | null | undefined;
  /** Injected so the refresh window is testable without faking the clock. */
  now?: Date;
}

/** Operator-facing wording for each registry-side denial. */
function describeIneligibility(
  descriptor: SourceDescriptor,
  reason: DescriptorIneligibility,
): string {
  switch (reason) {
    case "kill_switch":
      return `Source "${descriptor.id}" has its code-level kill switch engaged.`;
    case "registry_not_production_approved":
      return `Registry policy for "${descriptor.id}" is ${descriptor.complianceState}, not approved_for_production.`;
    case "tos_not_permitted":
      return (
        `Terms-of-service posture for "${descriptor.id}" is ${descriptor.tosPosture}, not permits_use. ` +
        `Only a completed ToS review that permits our use lets a source run live.`
      );
    case "robots_not_permitted":
      return (
        `Robots posture for "${descriptor.id}" is ${descriptor.robotsPosture}. We crawl only where robots ` +
        `is permissive (with or without a delay) — "restricted" and "unknown" both mean we do not have permission.`
      );
  }
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

  // The registry-side conditions live in ONE predicate (source.ts), which
  // productionApprovedSources() also uses. They used to be implemented twice,
  // in different subsets: the registry helper checked only state + kill switch,
  // so a source whose ToS prohibits use, or whose robots posture is restricted,
  // was reported "approved" there while the gate refused it.
  const ineligible = descriptorIneligibility(descriptor);
  if (ineligible) {
    return { allowed: false, reason: ineligible, detail: describeIneligibility(descriptor, ineligible) };
  }

  const record = input.record;
  if (!record) {
    return {
      allowed: false,
      reason: "record_missing",
      detail: `No approval record exists for "${descriptor.id}". An approval must be recorded before it can run.`,
    };
  }

  // The record must be THIS source's. Nothing checked, so a caller that
  // cross-wired the lookup could authorize one source with another's approval —
  // and the whole gate rests on the record actually belonging to the descriptor
  // it is being asked about.
  if (record.id !== descriptor.id) {
    return {
      allowed: false,
      reason: "record_mismatch",
      detail: `Approval record "${record.id}" does not belong to source "${descriptor.id}". Refusing rather than authorizing one source with another's approval.`,
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

  // refreshIntervalMinutes is a REVIEWED crawl schedule, not a hint. Nothing
  // enforced it, so every approved source ran on every cron invocation — the
  // declared per-source cadence was inert, and we could crawl a source far more
  // often than its own robots/ToS review allows. Politeness that only exists in
  // a config field is not politeness.
  const lastRunAt = record.lastRunAt;
  if (lastRunAt) {
    const last = Date.parse(lastRunAt);
    // An unparseable timestamp must not silently mean "run now" — treat the
    // schedule as unknown and defer rather than crawl on bad data.
    if (Number.isNaN(last)) {
      return {
        allowed: false,
        reason: "refresh_not_due",
        detail: `Source "${descriptor.id}" has an unreadable last_run_at (${lastRunAt}); refusing rather than guessing at its refresh window.`,
      };
    }
    const elapsedMinutes = ((input.now ?? new Date()).getTime() - last) / 60_000;
    if (elapsedMinutes < descriptor.refreshIntervalMinutes) {
      const waitMinutes = Math.ceil(descriptor.refreshIntervalMinutes - elapsedMinutes);
      return {
        allowed: false,
        reason: "refresh_not_due",
        detail: `Source "${descriptor.id}" ran ${Math.floor(elapsedMinutes)}m ago and its reviewed refresh interval is ${descriptor.refreshIntervalMinutes}m. Next run in ~${waitMinutes}m.`,
      };
    }
  }

  return { allowed: true, descriptor };
}

/** Convenience for call sites that just need the reason string. */
export function describeGateDecision(decision: GateDecision): string {
  return decision.allowed ? "allowed" : `${decision.reason}: ${decision.detail}`;
}
