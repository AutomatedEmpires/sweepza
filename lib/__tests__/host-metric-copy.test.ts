import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function source(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

describe("host seeker-state metric copy", () => {
  it("labels recorded seeker state without claiming completed entries", () => {
    const analytics = source("app/host/analytics/page.tsx");
    const listings = source("app/host/listings/page.tsx");

    expect(analytics).toContain("Total marked entered");
    expect(analytics).toContain("Marked entered this week");
    expect(analytics).toContain("mark-entered rate");
    expect(analytics).toMatch(
      /not\s+confirmed sponsor-site completions/,
    );
    expect(listings).toContain("marked entered");

    expect(analytics).not.toContain('label="Total entries"');
    expect(analytics).not.toContain('label="Entries this week"');
    expect(analytics).not.toContain("% conversion");
    expect(analytics).not.toMatch(/\}\s+entries/);
    expect(listings).not.toMatch(/\}\s+entries/);
  });
});
