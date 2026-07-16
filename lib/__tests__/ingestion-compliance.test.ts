import { describe, expect, it } from "vitest";
import {
  COMPLIANCE_TRANSITIONS,
  SOURCE_COMPLIANCE_STATES,
  canTransition,
  isComplianceState,
  isFixtureExecutable,
  isProductionExecutable,
} from "@/lib/ingestion/compliance";

describe("compliance state machine", () => {
  it("only treats approved_for_production as production-executable", () => {
    const executable = SOURCE_COMPLIANCE_STATES.filter(isProductionExecutable);
    expect(executable).toEqual(["approved_for_production"]);
  });

  it("treats unknown / malformed states as not executable", () => {
    for (const value of [null, undefined, "", "approved", "APPROVED_FOR_PRODUCTION", 1, {}]) {
      expect(isProductionExecutable(value as never)).toBe(false);
      expect(isFixtureExecutable(value as never)).toBe(false);
    }
  });

  it("permits fixture execution only from the approval rungs", () => {
    const fixtureOk = SOURCE_COMPLIANCE_STATES.filter(isFixtureExecutable);
    expect(fixtureOk).toEqual([
      "approved_for_fixtures",
      "approved_for_manual_check",
      "approved_for_production",
    ]);
  });

  it("cannot jump the ladder — draft may not reach production directly", () => {
    expect(canTransition("draft", "approved_for_production")).toBe(false);
    expect(canTransition("draft", "approved_for_fixtures")).toBe(false);
    expect(canTransition("reviewed", "approved_for_production")).toBe(false);
    // The only legal entry to production is from a manual-check approval.
    expect(canTransition("approved_for_manual_check", "approved_for_production")).toBe(true);
  });

  it("lets every operating rung be contained immediately", () => {
    for (const state of ["approved_for_fixtures", "approved_for_manual_check", "approved_for_production"] as const) {
      expect(canTransition(state, "paused")).toBe(true);
      expect(canTransition(state, "blocked")).toBe(true);
      expect(canTransition(state, "revoked")).toBe(true);
    }
  });

  it("makes revoked terminal — a revoked source can never transition again", () => {
    expect(COMPLIANCE_TRANSITIONS.revoked).toEqual([]);
    for (const state of SOURCE_COMPLIANCE_STATES) {
      expect(canTransition("revoked", state)).toBe(false);
    }
  });

  it("does not snap a paused source back to production implicitly", () => {
    // Resuming is legal, but it is its own audited decision.
    expect(canTransition("paused", "approved_for_production")).toBe(true);
    // ...and a blocked source must be re-researched, never resumed directly.
    expect(canTransition("blocked", "approved_for_production")).toBe(false);
    expect(canTransition("blocked", "research_required")).toBe(true);
  });

  it("names every state in the transition table", () => {
    expect(Object.keys(COMPLIANCE_TRANSITIONS).sort()).toEqual([...SOURCE_COMPLIANCE_STATES].sort());
  });

  it("never lists a transition to an unknown state", () => {
    for (const targets of Object.values(COMPLIANCE_TRANSITIONS)) {
      for (const target of targets) expect(isComplianceState(target)).toBe(true);
    }
  });
});
