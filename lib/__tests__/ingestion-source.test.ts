import { describe, expect, it } from "vitest";
import {
  SOURCE_REGISTRY,
  enabledSources,
  getSourceDescriptor,
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

  it("keeps every source disabled until its adapter + ToS are cleared", () => {
    expect(enabledSources()).toHaveLength(0);
  });

  it("respects The Freebie Guy's robots crawl-delay of 10s", () => {
    expect(getSourceDescriptor("freebie_guy")?.crawlDelayMs).toBe(10000);
  });

  it("marks the official source as tier 'official'", () => {
    expect(getSourceDescriptor("official_direct")?.tier).toBe("official");
  });
});
