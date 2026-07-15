import "server-only";
import { unstable_cache } from "next/cache";
import type { Listing } from "@/lib/types/listing";
import { getPublicListings } from "./listings";

/**
 * Cache tag for the anonymous public listing feed. Any server route that
 * changes which listings are publicly live must call
 * `revalidateTag(PUBLIC_LISTINGS_TAG)` so the shared feed reflects the change
 * on the next read. Current mutation points: admin create
 * (`/api/admin/listings`), host-submission review
 * (`/api/admin/listings/review`), and the expire-stale cron
 * (`/api/cron/expire-stale`).
 */
export const PUBLIC_LISTINGS_TAG = "public-listings";

// Even without a mutation event, a listing can silently age out of its
// end_date window; the anon feed query filters on lifecycle_status = active,
// so a background revalidate this often keeps the cached feed honest with no
// explicit invalidation.
const PUBLIC_LISTINGS_TTL_SECONDS = 300;

const cachedDefaultFeed = unstable_cache(
  (limit: number): Promise<Listing[]> => getPublicListings({ limit }),
  ["public-listings-default"],
  { revalidate: PUBLIC_LISTINGS_TTL_SECONDS, tags: [PUBLIC_LISTINGS_TAG] },
);

/**
 * Cached read of the DEFAULT (unfiltered) public feed — the anonymous
 * homepage/Discover query that is byte-for-byte identical for every visitor,
 * so it caches with a near-100% hit rate. Search and category-filtered reads
 * are intentionally excluded (high cardinality, low reuse) and keep calling
 * `getPublicListings` directly.
 *
 * Safe to cache: `getPublicListings` with no access token runs on the anon
 * Supabase client and touches no request-scoped state (cookies/headers), so it
 * satisfies `unstable_cache`'s purity contract.
 */
export function getCachedPublicListings(limit: number): Promise<Listing[]> {
  return cachedDefaultFeed(limit);
}
