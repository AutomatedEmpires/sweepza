import type { MetadataRoute } from "next";
import { CATEGORY_HUBS } from "@/lib/category-hubs";
import { getPublicListings } from "@/lib/db/listings";
import { APP_URL } from "@/lib/site";

// Indexable public surfaces only. /my-sweeps is deliberately absent: it serves
// robots noindex,nofollow, and listing it here asked crawlers to fetch a page
// that then told them to go away.
const STATIC_PATHS = [
  "",
  "/discover",
  "/discover/swipe",
  "/about",
  "/faq",
  "/privacy",
  "/cookies",
  "/terms",
  "/winners",
  "/host",
];

// These pages change when the code changes, not per request. Stamping
// `new Date()` told every crawl that all of them had just been modified,
// which is noise that devalues the signal on entries that really did change
// (listing details, which carry their own publishedAt).
const STATIC_LAST_MODIFIED = new Date("2026-08-01T00:00:00.000Z");

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticEntries: MetadataRoute.Sitemap = STATIC_PATHS.map((path) => ({
    url: `${APP_URL}${path}`,
    lastModified: STATIC_LAST_MODIFIED,
  }));

  // Category hubs — one crawlable landing page per dictionary category.
  const hubEntries: MetadataRoute.Sitemap = CATEGORY_HUBS.map((hub) => ({
    url: `${APP_URL}/discover/${hub.slug}`,
    lastModified: STATIC_LAST_MODIFIED,
  }));

  try {
    const listings = await getPublicListings({ limit: 100 });
    const listingEntries: MetadataRoute.Sitemap = listings.map((listing) => ({
      url: `${APP_URL}/sweeps/${listing.slug}`,
      lastModified: listing.publishedAt
        ? new Date(listing.publishedAt)
        : new Date(),
    }));

    return [...staticEntries, ...hubEntries, ...listingEntries];
  } catch {
    return [...staticEntries, ...hubEntries];
  }
}
