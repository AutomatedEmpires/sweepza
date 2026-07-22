import { describe, expect, it, vi } from "vitest";
import type { Listing } from "@/lib/types/listing";

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
  isListingCurrentForPublicCache,
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
    const feed = [{
      id: "a",
      lifecycleStatus: "active",
      endDate: "2999-12-31",
    }] as never;
    mocks.getPublicListings.mockResolvedValueOnce(feed);

    await expect(getCachedPublicListings(60)).resolves.toEqual(feed);
    expect(mocks.getPublicListings).toHaveBeenCalledWith({ limit: 60 });
  });

  it("keeps a current cache hit on the single cached-read path", async () => {
    const feed = [{
      id: "current",
      lifecycleStatus: "active",
      endDate: "2999-12-31",
    }] as never;
    mocks.getPublicListings.mockResolvedValueOnce(feed);

    await expect(getCachedPublicListings(30)).resolves.toEqual(feed);
    expect(mocks.getPublicListings).toHaveBeenCalledTimes(1);
    expect(mocks.getPublicListings).toHaveBeenCalledWith({ limit: 30 });
  });

  it("refills from the live query when cutoff filtering removes cached rows", async () => {
    const staleFeed = [
      {
        id: "expired",
        lifecycleStatus: "active",
        endDate: "2000-01-01",
      },
    ] as never;
    const refreshedFeed = [
      {
        id: "replacement",
        lifecycleStatus: "active",
        endDate: "2999-12-31",
      },
    ] as never;
    mocks.getPublicListings
      .mockResolvedValueOnce(staleFeed)
      .mockResolvedValueOnce(refreshedFeed);

    await expect(getCachedPublicListings(30)).resolves.toEqual(refreshedFeed);
    expect(mocks.getPublicListings).toHaveBeenCalledTimes(2);
    expect(mocks.getPublicListings).toHaveBeenNthCalledWith(1, { limit: 30 });
    expect(mocks.getPublicListings).toHaveBeenNthCalledWith(2, { limit: 30 });
  });

  it("reapplies the safety filter to a cutoff-triggered refill", async () => {
    const staleListing = {
      id: "expired",
      lifecycleStatus: "active",
      endDate: "2000-01-01",
    };
    const currentListing = {
      id: "current",
      lifecycleStatus: "active",
      endDate: "2999-12-31",
    };
    mocks.getPublicListings
      .mockResolvedValueOnce([staleListing])
      .mockResolvedValueOnce([staleListing, currentListing]);

    await expect(getCachedPublicListings(30)).resolves.toEqual([currentListing]);
  });

  it("forwards the slug to the single-listing query", async () => {
    const listing = {
      id: "a",
      slug: "prize-sweep",
      lifecycleStatus: "active",
      endDate: "2999-12-31",
    } as never;
    mocks.getListingBySlug.mockResolvedValueOnce(listing);

    await expect(getCachedListingBySlug("prize-sweep")).resolves.toBe(listing);
    expect(mocks.getListingBySlug).toHaveBeenCalledWith("prize-sweep");
  });

  it("busts exactly the public-listings tag on revalidation", () => {
    revalidatePublicListings();
    expect(mocks.revalidateTag).toHaveBeenCalledWith(PUBLIC_LISTINGS_TAG);
  });

  it("keeps a date-only listing cached through the canonical UTC-12 grace", () => {
    const listing = {
      lifecycleStatus: "active",
      endDate: "2026-07-16",
    } as Listing;

    expect(
      isListingCurrentForPublicCache(listing, new Date("2026-07-17T11:59:59.999Z")),
    ).toBe(true);
    expect(
      isListingCurrentForPublicCache(listing, new Date("2026-07-17T12:00:00.000Z")),
    ).toBe(false);
  });
});
