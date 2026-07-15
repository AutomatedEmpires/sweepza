import { describe, expect, it } from "vitest";
import {
  PUBLIC_LISTINGS_TAG,
  getCachedPublicListings,
} from "@/lib/db/listings-cache";

// The tag string is the contract between the cached read and every route that
// invalidates it (admin create, review, expire-stale cron). If it drifts here
// without those routes following, published listings would silently fail to
// appear until the TTL lapses — so pin it.
describe("public listings cache", () => {
  it("exposes a stable revalidation tag", () => {
    expect(PUBLIC_LISTINGS_TAG).toBe("public-listings");
  });

  it("exposes a cached feed reader", () => {
    expect(typeof getCachedPublicListings).toBe("function");
  });
});
