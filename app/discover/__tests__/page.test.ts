import { beforeEach, describe, expect, it, vi } from "vitest";

const listingReads = vi.hoisted(() => ({
  getCachedPublicListings: vi.fn(),
  getPublicListings: vi.fn(),
}));

vi.mock("@/lib/db/listings", () => ({
  getPublicListings: listingReads.getPublicListings,
}));

vi.mock("@/lib/db/listings-cache", () => ({
  getCachedPublicListings: listingReads.getCachedPublicListings,
}));

import DiscoverPage from "@/app/discover/page";

describe("DiscoverPage inventory failures", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("propagates an unfiltered cached-read failure to the route boundary", async () => {
    const failure = new Error("cached inventory unavailable");
    listingReads.getCachedPublicListings.mockRejectedValueOnce(failure);

    await expect(
      DiscoverPage({ searchParams: Promise.resolve({}) }),
    ).rejects.toBe(failure);
    expect(listingReads.getCachedPublicListings).toHaveBeenCalledWith(60);
    expect(listingReads.getPublicListings).not.toHaveBeenCalled();
  });

  it("propagates a filtered-read failure to the route boundary", async () => {
    const failure = new Error("filtered inventory unavailable");
    listingReads.getPublicListings.mockRejectedValueOnce(failure);

    await expect(
      DiscoverPage({
        searchParams: Promise.resolve({ q: "summer prize" }),
      }),
    ).rejects.toBe(failure);
    expect(listingReads.getPublicListings).toHaveBeenCalledWith({
      searchQuery: "summer prize",
      categories: undefined,
      limit: 60,
    });
    expect(listingReads.getCachedPublicListings).not.toHaveBeenCalled();
  });
});
