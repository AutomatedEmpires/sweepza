import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  OfficialDestinationPolicyConsole,
  toLocalEndOfDayIso,
} from "@/components/official-destination-policy-console";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

describe("OfficialDestinationPolicyConsole", () => {
  it("converts a selected review date to local end-of-day", () => {
    const previousTimeZone = process.env.TZ;
    process.env.TZ = "America/Los_Angeles";

    try {
      expect(toLocalEndOfDayIso("2026-07-29")).toBe(
        "2026-07-30T06:59:59.999Z",
      );
      expect(toLocalEndOfDayIso("2026-02-31")).toBeNull();
    } finally {
      if (previousTimeZone === undefined) {
        delete process.env.TZ;
      } else {
        process.env.TZ = previousTimeZone;
      }
    }
  });

  it("blocks submission instead of sending a null expiry for an unparsable date", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const source = readFileSync(
      join(process.cwd(), "components/official-destination-policy-console.tsx"),
      "utf8",
    );

    const guard = source.indexOf(
      'setResult({ error: "Enter the review expiry as a valid date." });',
    );
    const payloadBuild = source.indexOf("const decision = {");
    // The guard must run before the decision payload is assembled, so an
    // operator-supplied-but-unparsable date can never silently become a
    // no-expiry approval request.
    expect(guard).toBeGreaterThan(-1);
    expect(payloadBuild).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(payloadBuild);
    expect(source).not.toContain(
      "reviewExpiresAt: expiryDate ? toLocalEndOfDayIso(expiryDate) : null",
    );
  });

  it("labels the date boundary in the operator's local time zone", () => {
    const html = renderToStaticMarkup(
      <OfficialDestinationPolicyConsole policies={[]} readable />,
    );

    expect(html).toContain("Review expires (local date)");
    expect(html).toContain(
      "Access ends at 11:59 PM in this browser&#x27;s time zone.",
    );
  });
});
