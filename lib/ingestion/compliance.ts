// Source compliance state machine — the policy layer deciding whether a source
// may run AT ALL, independent of whether its adapter code works. A source walks
// an explicit approval ladder; production execution requires the single terminal
// approval state, everywhere it is checked (static registry floor, DB record,
// and the orchestrator gate). Everything else — including "we simply don't
// know" — refuses to execute. Pure and dependency-free so the rules are
// unit-testable and reusable on both server and admin surfaces.

export const SOURCE_COMPLIANCE_STATES = [
  "draft",
  "research_required",
  "reviewed",
  "approved_for_fixtures",
  "approved_for_manual_check",
  "approved_for_production",
  "paused",
  "blocked",
  "revoked",
] as const;

export type SourceComplianceState = (typeof SOURCE_COMPLIANCE_STATES)[number];

/**
 * Allowed transitions. The forward ladder is deliberate (each rung is a human
 * decision with evidence); the containment states are reachable from any
 * operating rung. `revoked` is terminal: it stops new work forever without
 * deleting history — a revoked source needs a fresh registry entry (and a fresh
 * approval ladder) to ever run again.
 */
export const COMPLIANCE_TRANSITIONS: Record<
  SourceComplianceState,
  readonly SourceComplianceState[]
> = {
  draft: ["research_required", "reviewed", "blocked"],
  research_required: ["reviewed", "draft", "blocked"],
  reviewed: ["approved_for_fixtures", "research_required", "blocked"],
  approved_for_fixtures: [
    "approved_for_manual_check",
    "reviewed",
    "paused",
    "blocked",
    "revoked",
  ],
  approved_for_manual_check: [
    "approved_for_production",
    "approved_for_fixtures",
    "paused",
    "blocked",
    "revoked",
  ],
  approved_for_production: ["paused", "blocked", "revoked"],
  // Resuming from pause returns to an approval rung explicitly — the resume is
  // itself an audited decision, not an automatic snap-back.
  paused: [
    "approved_for_fixtures",
    "approved_for_manual_check",
    "approved_for_production",
    "blocked",
    "revoked",
  ],
  blocked: ["research_required", "revoked"],
  revoked: [],
};

export function isComplianceState(value: unknown): value is SourceComplianceState {
  return (
    typeof value === "string" &&
    (SOURCE_COMPLIANCE_STATES as readonly string[]).includes(value)
  );
}

export function canTransition(
  from: SourceComplianceState,
  to: SourceComplianceState,
): boolean {
  return COMPLIANCE_TRANSITIONS[from].includes(to);
}

/** The one and only state that permits live production execution. */
export function isProductionExecutable(
  state: SourceComplianceState | string | null | undefined,
): state is "approved_for_production" {
  return state === "approved_for_production";
}

/**
 * States that permit fixture-driven execution (dry runs, CI, dev harnesses) —
 * never a live network call. Anything below this rung hasn't been reviewed
 * enough to even simulate.
 */
export function isFixtureExecutable(
  state: SourceComplianceState | string | null | undefined,
): boolean {
  return (
    state === "approved_for_fixtures" ||
    state === "approved_for_manual_check" ||
    state === "approved_for_production"
  );
}
