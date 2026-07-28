import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROUTES = [
  ["discover", "Discover couldn’t refresh"],
  ["my-sweeps", "Your sweep activity couldn’t load"],
  ["winners", "Winner stories couldn’t load"],
  ["profile", "Your profile couldn’t load"],
  ["host", "Your host workspace couldn’t load"],
  ["admin", "The command center couldn’t load"],
] as const;

function source(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

describe.each(ROUTES)("%s route reliability boundary", (route, title) => {
  it("announces its workflow-shaped loading state", () => {
    const loading = source(`app/${route}/loading.tsx`);

    expect(loading).toContain('aria-busy="true"');
    expect(loading).toContain('aria-live="polite"');
    expect(loading).toContain('className="sr-only"');
  });

  it("is a retryable client error boundary with route-specific copy", () => {
    const error = source(`app/${route}/error.tsx`);

    expect(error.trimStart().startsWith('"use client";')).toBe(true);
    expect(error).toContain("<WorkflowErrorState");
    expect(error).toContain(`scope="${route}"`);
    expect(error).toContain(`title="${title}"`);
    expect(error).toContain("retryLabel=");
  });

  it("leaves authentication and data authorization in the server route", () => {
    const boundarySource = [
      source(`app/${route}/loading.tsx`),
      source(`app/${route}/error.tsx`),
    ].join("\n");

    expect(boundarySource).not.toContain("@/lib/auth");
    expect(boundarySource).not.toContain("@/lib/db/");
  });
});

it("uses listing-card skeletons only for the Discover inventory workflow", () => {
  const routesUsingListingSkeletons = ROUTES.filter(([route]) =>
    source(`app/${route}/loading.tsx`).includes("ListingSkeletonList"),
  ).map(([route]) => route);

  expect(routesUsingListingSkeletons).toEqual(["discover"]);
});

it("lets primary Discover read failures reach its retry boundary", () => {
  const page = source("app/discover/page.tsx");

  expect(page).not.toContain("withPublicFallback");
  expect(page).toContain("getCachedPublicListings(60)");
  expect(page).toContain("getPublicListings({");
});

describe("shared workflow error presentation", () => {
  const boundary = source("components/workflow-error-state.tsx");

  it("reports failures without exposing details and provides accessible recovery", () => {
    expect(boundary).toContain("Sentry.captureException(error)");
    expect(boundary).toContain('role="alert"');
    expect(boundary).toContain("onClick={() => reset()}");
    expect(boundary).toContain("min-h-11");
    expect(boundary).toContain("focus-visible:ring-2");
    expect(boundary).not.toContain("error.message");
    expect(boundary).not.toContain("error.digest");
  });
});
