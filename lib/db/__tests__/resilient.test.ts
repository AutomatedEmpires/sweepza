import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ captureException: vi.fn() }));
vi.mock("@sentry/nextjs", () => ({ captureException: mocks.captureException }));
// Faithful stand-in for Next's unstable_rethrow: control-flow errors (redirect
// / notFound carry a NEXT_-prefixed digest) are rethrown, everything else
// passes through.
vi.mock("next/navigation", () => ({
  unstable_rethrow: (error: unknown) => {
    const digest = (error as { digest?: string } | null)?.digest;
    if (typeof digest === "string" && digest.startsWith("NEXT_")) throw error;
  },
}));

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

  it("rethrows Next.js control-flow errors instead of swallowing them", async () => {
    const redirect = Object.assign(new Error("NEXT_REDIRECT"), {
      digest: "NEXT_REDIRECT;replace;/discover;307;",
    });
    await expect(
      withPublicFallback(Promise.reject(redirect), [], "today_feed"),
    ).rejects.toBe(redirect);
    expect(mocks.captureException).not.toHaveBeenCalled();
  });
});
