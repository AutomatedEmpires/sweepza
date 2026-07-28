import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { analyticsPathname } from "@/lib/analytics-path";

describe("page-view analytics privacy", () => {
  it.each([
    ["/discover", "/discover"],
    ["/discover?q=private%40example.com", "/discover"],
    ["/search?query=medical+prize#results", "/search"],
    ["/profile#reminders", "/profile"],
    ["?q=private", "/"],
  ])("keeps only the pathname from %s", (value, expected) => {
    expect(analyticsPathname(value)).toBe(expected);
  });

  it("does not subscribe to or capture App Router search parameters", () => {
    const source = readFileSync(
      join(process.cwd(), "components/observability-providers.tsx"),
      "utf8",
    );

    expect(source).not.toContain("useSearchParams");
    expect(source).not.toContain("searchParams");
    expect(source).toContain("$current_url: analyticsPathname(pathname)");
  });
});
