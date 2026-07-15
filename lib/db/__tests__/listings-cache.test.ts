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
}));

vi.mock("next/cache", () => ({
  unstable_cache: mocks.unstable_cache,
  revalidateTag: mocks.revalidateTag,
}));

vi.mock("@/lib/db/listings", () => ({
  getPublicListings: mocks.getPublicListings,
}));

import {
  PUBLIC_LISTINGS_TAG,
  getCachedPublicListings,
  revalidatePublicListings,
} from "@/lib/db/listings-cache";

// The unstable_cache config is registered once at module load. Capture it here,
// at import time, before vitest's clearMocks wipes the call record per-test.
const [cacheFn, cacheKeyParts, cacheOptions] =
  mocks.unstable_cache.mock.calls[0] ?? [];

describe("public listings cache", () => {
  // The tag string is the contract between the cached read and every route that
  // invalidates it. If it drifts here without those routes following, withdrawn
  // or moderated listings could linger on the public feed until the TTL lapses.
  it("exposes a stable revalidation tag", () => {
    expect(PUBLIC_LISTINGS_TAG).toBe("public-listings");
  });

  it("registers the cache with a stable key, tag, and 5-minute TTL", () => {
    expect(typeof cacheFn).toBe("function");
    expect(cacheKeyParts).toEqual(["public-listings-default"]);
    expect(cacheOptions).toEqual({
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

  it("busts exactly the public-listings tag on revalidation", () => {
    revalidatePublicListings();
    expect(mocks.revalidateTag).toHaveBeenCalledWith(PUBLIC_LISTINGS_TAG);
  });
});
