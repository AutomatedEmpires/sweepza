import { beforeEach, describe, expect, it, vi } from "vitest";

// Pins the rendering-layer notFound behavior for dead listing links. The
// middleware suite covers the pre-stream hard-404 probe; this helper remains
// defense in depth for client transitions and availability races.
const mocks = vi.hoisted(() => ({
  getCachedListingBySlug: vi.fn(),
}));

vi.mock("@/lib/db/listings-cache", () => ({
  getCachedListingBySlug: mocks.getCachedListingBySlug,
}));

import { requirePublicListingBySlug } from "@/lib/db/required-listing";

describe("requirePublicListingBySlug", () => {
  beforeEach(() => {
    mocks.getCachedListingBySlug.mockResolvedValue(null);
  });

  it("throws notFound() when no public row resolves", async () => {
    await expect(requirePublicListingBySlug("gone-sweep")).rejects.toMatchObject(
      {
        digest: expect.stringMatching(
          /NEXT_(HTTP_ERROR_FALLBACK;404|NOT_FOUND)/,
        ),
      },
    );
  });

  it("returns the listing when it resolves", async () => {
    const listing = { id: "l1", slug: "live-sweep" };
    mocks.getCachedListingBySlug.mockResolvedValue(listing);
    await expect(requirePublicListingBySlug("live-sweep")).resolves.toBe(
      listing,
    );
  });
});
