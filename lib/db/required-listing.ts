import "server-only";
import { notFound } from "next/navigation";
import { getCachedListingBySlug } from "@/lib/db/listings-cache";
import type { Listing } from "@/lib/types/listing";

/**
 * Resolve a public listing by slug or throw notFound(). The detail route
 * calls this from BOTH generateMetadata and the page body. Middleware owns
 * the hard-404 preflight because loading boundaries may commit a streamed
 * 200; this remains the rendering-layer defense for client transitions and
 * races. The lookup is cached, so the second call costs no extra fetch.
 */
export async function requirePublicListingBySlug(
  slug: string,
): Promise<Listing> {
  const listing = await getCachedListingBySlug(slug);
  if (!listing) notFound();
  return listing;
}
