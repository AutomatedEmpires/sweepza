import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const PRIVATE_ROUTE_FILES = [
  "app/my-sweeps/page.tsx",
  "app/profile/page.tsx",
  "app/profile/notifications/page.tsx",
  "app/winners/new/page.tsx",
  "app/host/analytics/page.tsx",
  "app/host/billing/page.tsx",
  "app/host/claims/page.tsx",
  "app/host/listings/page.tsx",
  "app/host/listings/[listingId]/edit/page.tsx",
  "app/host/notifications/page.tsx",
  "app/host/settings/page.tsx",
] as const;

const PRIVATE_ROBOTS_METADATA =
  /robots:\s*\{\s*index:\s*false,\s*follow:\s*false\s*\}/;

function source(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

describe("private route metadata", () => {
  it.each(PRIVATE_ROUTE_FILES)("%s explicitly blocks indexing and following", (file) => {
    expect(source(file)).toMatch(PRIVATE_ROBOTS_METADATA);
  });

  it("keeps the public host landing page indexable", () => {
    expect(source("app/host/page.tsx")).not.toMatch(PRIVATE_ROBOTS_METADATA);
  });
});
