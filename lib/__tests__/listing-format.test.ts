import { describe, expect, it } from "vitest";
import { formatEndDate, formatPrizeValue } from "@/lib/listing-format";

describe("listing presentation formatting", () => {
  it("renders date-only values as the stated calendar day", () => {
    expect(formatEndDate("2026-08-12")).toBe("Aug 12, 2026");
    expect(formatEndDate("2026-08-12T00:00:00.000Z")).toBe("Aug 12, 2026");
  });

  it("uses one deterministic currency locale for SSR and hydration", () => {
    expect(formatPrizeValue(10000, "USD")).toBe("$10,000");
  });
});

