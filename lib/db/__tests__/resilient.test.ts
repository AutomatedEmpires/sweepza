import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ captureException: vi.fn() }));
vi.mock("@sentry/nextjs", () => ({ captureException: mocks.captureException }));

import { withPublicFallback } from "@/lib/db/resilient";

describe("withPublicFallback", () => {
  it("passes a successful read through untouched", async () => {
    const feed = [{ id: "a" }];
    await expect(
      withPublicFallback(Promise.resolve(feed), [], "today_feed"),
    ).resolves.toBe(feed);
    expect(mocks.captureException).not.toHaveBeenCalled();
  });

  it("degrades a failed read to the fallback and reports to Sentry", async () => {
    const boom = new Error("getPublicListings failed: connection refused");
    await expect(
      withPublicFallback(Promise.reject(boom), [], "discover_feed"),
    ).resolves.toEqual([]);
    expect(mocks.captureException).toHaveBeenCalledWith(boom, {
      tags: { degraded_surface: "discover_feed" },
    });
  });
});
