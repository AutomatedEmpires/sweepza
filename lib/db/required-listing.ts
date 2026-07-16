import "server-only";
import { notFound } from "next/navigation";
import { getCachedListingBySlug } from "@/lib/db/listings-cache";
import type { Listing } from "@/lib/types/listing";

/**
 * Resolve a public listing by slug or throw notFound(). The detail route
 * calls this from BOTH generateMetadata and the page body: the metadata
 * phase settles before the streaming response commits, so failing there
 * keeps a dead slug a real HTTP 404 — a page-body-only notFound() would
 * stream inside an already-committed 200 because of the root loading
 * boundary. The lookup is cached, so the second call costs no extra fetch.
 */
export async function requirePublicListingBySlug(
  slug: string,
): Promise<Listing> {
  const listing = await getCachedListingBySlug(slug);
  if (!listing) notFound();
  return listing;
}
