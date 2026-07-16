import { beforeEach, describe, expect, it, vi } from "vitest";

// Pins the real-404 behavior for dead listing links: the detail route
// resolves its listing through requirePublicListingBySlug in BOTH
// generateMetadata and the page body. The metadata phase settles before the
// streaming response commits, so throwing notFound() there is what keeps a
// missing slug an HTTP 404 — a page-body-only notFound() would stream inside
// an already-committed 200 because of the root loading boundary.
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
