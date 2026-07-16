import { describe, expect, it } from "vitest";
import { isComplianceState } from "@/lib/ingestion/compliance";
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

  it("exposes fixture-approved sources (kill switch aside)", () => {
    expect(fixtureApprovedSources().length).toBe(SOURCE_REGISTRY.length);
  });
});
