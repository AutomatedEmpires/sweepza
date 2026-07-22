import "server-only";
import { revalidateTag, unstable_cache } from "next/cache";
import { assessExpiration } from "@/lib/ingestion/lifecycle";
import type { Listing } from "@/lib/types/listing";
import { getListingBySlug, getPublicListings } from "./listings";

/**
 * Cache tag for the anonymous public listing feed. Any server route that
 * changes which listings are publicly live must call
 * `revalidatePublicListings()` so the shared feed reflects the change on the
 * next read.
 */
export const PUBLIC_LISTINGS_TAG = "public-listings";

// Background refresh cadence — a defense-in-depth safety net. Serving code
// below also checks the canonical UTC-12 date-only deadline after every cache
// hit, so a listing cannot remain enterable after the grace lapses merely
// because the cron has not run yet.
const PUBLIC_LISTINGS_TTL_SECONDS = 300;

export function isListingCurrentForPublicCache(
  listing: Listing,
  now = new Date(),
): boolean {
  const expiration = assessExpiration(listing.endDate, now).state;
  return (
    listing.lifecycleStatus === "active" &&
    Boolean(listing.endDate) &&
    expiration !== "expired" &&
    expiration !== "unknown"
  );
}

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
export async function getCachedPublicListings(limit: number): Promise<Listing[]> {
  const listings = await cachedDefaultFeed(limit);
  const currentListings = listings.filter((listing) =>
    isListingCurrentForPublicCache(listing),
  );

  // A cache entry can straddle the canonical UTC-12 cutoff. Filtering keeps
  // expired promotions hidden, but returning that shortened snapshot would
  // leave Discover under-filled until the cache TTL lapses. Bypass only the
  // stale read to refill from the current public query; healthy cache hits
  // retain their normal one-read path and TTL/tag semantics.
  if (currentListings.length !== listings.length) {
    const refreshedListings = await getPublicListings({ limit });
    return refreshedListings.filter((listing) =>
      isListingCurrentForPublicCache(listing),
    );
  }

  return currentListings;
}

const cachedListingBySlug = unstable_cache(
  (slug: string): Promise<Listing | null> => getListingBySlug(slug),
  ["public-listing-by-slug"],
  { revalidate: PUBLIC_LISTINGS_TTL_SECONDS, tags: [PUBLIC_LISTINGS_TAG] },
);

/**
 * Cached read of a single public listing by slug — the anonymous
 * `/sweeps/[slug]` detail page and its JSON API, byte-for-byte identical for
 * every visitor. Keyed per slug (each gets its own cache entry) but sharing the
 * feed's tag, so every `revalidatePublicListings()` call refreshes detail
 * pages too. That is intentionally coarse: publishing one listing drops all
 * detail entries, but each re-read is a single indexed row, and it means detail
 * freshness needs zero extra wiring. Content edits are covered transitively —
 * a live listing can't be edited (only draft/held can), and re-approval busts
 * the tag.
 *
 * Same purity guarantee as the feed read: `getListingBySlug` applies strict
 * public/active/non-moderated predicates and touches no request-scoped state,
 * so the cached value is exactly what an anonymous visitor may see.
 */
export async function getCachedListingBySlug(slug: string): Promise<Listing | null> {
  const listing = await cachedListingBySlug(slug);
  return listing && isListingCurrentForPublicCache(listing) ? listing : null;
}

/**
 * Drop the cached public feed and every cached detail page. Call from a server
 * action / route handler after any mutation that changes which listings are
 * publicly live — publish, review outcome, host takedown, host suspension,
 * moderation action, or cron expiry. Centralized so every new mutation path has
 * one obvious thing to call.
 */
export function revalidatePublicListings(): void {
  revalidateTag(PUBLIC_LISTINGS_TAG);
}
