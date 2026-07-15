import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  // unstable_cache(fn, keyParts, opts) returns the wrapped reader. Emulate a
  // passthrough so we can both capture the config and exercise delegation.
  unstable_cache: vi.fn(
    (
      fn: (...args: unknown[]) => unknown,
      _keyParts?: string[],
      _options?: { revalidate?: number; tags?: string[] },
    ) => fn,
  ),
  revalidateTag: vi.fn(),
  getPublicListings: vi.fn(),
  getListingBySlug: vi.fn(),
}));

vi.mock("next/cache", () => ({
  unstable_cache: mocks.unstable_cache,
  revalidateTag: mocks.revalidateTag,
}));

vi.mock("@/lib/db/listings", () => ({
  getPublicListings: mocks.getPublicListings,
  getListingBySlug: mocks.getListingBySlug,
}));

import {
  PUBLIC_LISTINGS_TAG,
  getCachedListingBySlug,
  getCachedPublicListings,
  revalidatePublicListings,
} from "@/lib/db/listings-cache";

// Both caches are registered once at module load. Capture their configs here,
// at import time, before vitest's clearMocks wipes the call records per-test.
const [feedFn, feedKeyParts, feedOptions] =
  mocks.unstable_cache.mock.calls[0] ?? [];
const [detailFn, detailKeyParts, detailOptions] =
  mocks.unstable_cache.mock.calls[1] ?? [];

describe("public listings cache", () => {
  // The tag string is the contract between the cached reads and every route
  // that invalidates them. If it drifts here without those routes following,
  // withdrawn or moderated listings could linger on the public feed / detail
  // pages until the TTL lapses.
  it("exposes a stable revalidation tag", () => {
    expect(PUBLIC_LISTINGS_TAG).toBe("public-listings");
  });

  it("registers the feed cache with a stable key, tag, and 5-minute TTL", () => {
    expect(typeof feedFn).toBe("function");
    expect(feedKeyParts).toEqual(["public-listings-default"]);
    expect(feedOptions).toEqual({ revalidate: 300, tags: [PUBLIC_LISTINGS_TAG] });
  });

  it("registers the detail cache under the same tag and TTL", () => {
    expect(typeof detailFn).toBe("function");
    expect(detailKeyParts).toEqual(["public-listing-by-slug"]);
    expect(detailOptions).toEqual({
      revalidate: 300,
      tags: [PUBLIC_LISTINGS_TAG],
    });
  });

  it("forwards the requested limit to the unfiltered public query", async () => {
    const feed = [{ id: "a" }];
    mocks.getPublicListings.mockResolvedValueOnce(feed);

    await expect(getCachedPublicListings(60)).resolves.toBe(feed);
    expect(mocks.getPublicListings).toHaveBeenCalledWith({ limit: 60 });
  });

  it("forwards the slug to the single-listing query", async () => {
    const listing = { id: "a", slug: "prize-sweep" };
    mocks.getListingBySlug.mockResolvedValueOnce(listing);

    await expect(getCachedListingBySlug("prize-sweep")).resolves.toBe(listing);
    expect(mocks.getListingBySlug).toHaveBeenCalledWith("prize-sweep");
  });

  it("busts exactly the public-listings tag on revalidation", () => {
    revalidatePublicListings();
    expect(mocks.revalidateTag).toHaveBeenCalledWith(PUBLIC_LISTINGS_TAG);
  });
});
