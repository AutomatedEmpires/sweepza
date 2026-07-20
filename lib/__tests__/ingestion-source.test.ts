import { describe, expect, it } from "vitest";
import { isComplianceState, isFixtureExecutable } from "@/lib/ingestion/compliance";
import {
  SOURCE_REGISTRY,
  fixtureApprovedSources,
  getSourceDescriptor,
  productionApprovedSources,
  sourcesByBuildPriority,
} from "@/lib/ingestion/source";

describe("source registry", () => {
  it("has unique ids", () => {
    const ids = SOURCE_REGISTRY.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("ranks by discovery yield, not audience size", () => {
    // Sweeps Advantage (~146K users but 200+/day, structured) beats Freebie Guy
    // (~1.8M users but broad freebies) for ingestion.
    const order = sourcesByBuildPriority().map((s) => s.id);
    expect(order).toEqual([
      "official_direct",
      "sweeps_advantage",
      "freebie_guy",
      "sweepstakes_today",
    ]);
  });

  it("ships with no source approved for production", () => {
    expect(productionApprovedSources()).toHaveLength(0);
  });

  it("carries a valid compliance state on every source, never above the fixtures rung", () => {
    for (const source of SOURCE_REGISTRY) {
      expect(isComplianceState(source.complianceState)).toBe(true);
      expect(source.complianceState).not.toBe("approved_for_production");
    }
  });

  it("respects The Freebie Guy's robots crawl-delay of 10s", () => {
    expect(getSourceDescriptor("freebie_guy")?.crawlDelayMs).toBe(10000);
  });

  it("marks the official source as tier 'official'", () => {
    expect(getSourceDescriptor("official_direct")?.tier).toBe("official");
  });

  it("gives each discovery source a bounded host allowlist and a request budget", () => {
    for (const source of SOURCE_REGISTRY) {
      expect(source.requestBudgetPerRun).toBeGreaterThan(0);
      if (source.tier === "discovery") {
        expect(source.allowedHosts.length).toBeGreaterThan(0);
      }
    }
    // official_direct is intentionally unbounded — its reach is per-lead.
    expect(getSourceDescriptor("official_direct")?.allowedHosts).toEqual([]);
  });

  it("exposes only sources whose compliance state permits fixture execution", () => {
    // Was: `length === SOURCE_REGISTRY.length` — i.e. everything not kill-switched
    // is fixture-approved. That asserted the bug: it swept in draft/reviewed/
    // paused/blocked/revoked, and contradicted isFixtureExecutable, which owns
    // the rule. official_direct is the live proof — it sits at `reviewed`.
    const approved = fixtureApprovedSources();

    expect(approved.length).toBeGreaterThan(0);
    for (const source of approved) {
      expect(isFixtureExecutable(source.complianceState)).toBe(true);
    }
    expect(approved.map((s) => s.id)).not.toContain("official_direct");
    expect(getSourceDescriptor("official_direct")?.complianceState).toBe("reviewed");
  });

  it("never reports a source below the fixtures rung, or a kill-switched one", () => {
    const belowRung = SOURCE_REGISTRY.filter((s) => !isFixtureExecutable(s.complianceState));
    const approvedIds = new Set(fixtureApprovedSources().map((s) => s.id));
    for (const source of belowRung) expect(approvedIds.has(source.id)).toBe(false);

    // Both conditions are required — the state test does not replace the switch.
    const runnable = SOURCE_REGISTRY.find((s) => isFixtureExecutable(s.complianceState));
    expect(runnable).toBeDefined();
    expect(fixtureApprovedSources().some((s) => s.id === runnable!.id)).toBe(true);
    expect(fixtureApprovedSources().every((s) => !s.killSwitch)).toBe(true);
  });
});
