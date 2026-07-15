import "server-only";
import { revalidateTag, unstable_cache } from "next/cache";
import type { Listing } from "@/lib/types/listing";
import { getPublicListings } from "./listings";

/**
 * Cache tag for the anonymous public listing feed. Any server route that
 * changes which listings are publicly live must call
 * `revalidatePublicListings()` so the shared feed reflects the change on the
 * next read.
 */
export const PUBLIC_LISTINGS_TAG = "public-listings";

// Background refresh cadence — a defense-in-depth safety net, NOT the primary
// invalidation path. Every mutation that changes the live set calls
// `revalidatePublicListings()` for immediate correctness; this TTL only bounds
// staleness for a path that might be missed. It deliberately does not age out
// listings whose `end_date` has passed: `getPublicListings` filters on
// `lifecycle_status`, so an ended-but-still-active row keeps showing until the
// expire-stale cron flips it to `expired` (and that cron busts this cache).
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

/**
 * Drop the cached public feed. Call from a server action / route handler after
 * any mutation that changes which listings are publicly live — publish, review
 * outcome, host takedown, host suspension, moderation action, or cron expiry.
 * Centralized so every new mutation path has one obvious thing to call.
 */
export function revalidatePublicListings(): void {
  revalidateTag(PUBLIC_LISTINGS_TAG);
}
