import type { MetadataRoute } from "next";
import { CATEGORY_HUBS } from "@/lib/category-hubs";
import { getPublicListings } from "@/lib/db/listings";
import { APP_URL } from "@/lib/site";

const STATIC_PATHS = [
  "",
  "/discover",
  "/discover/swipe",
  "/about",
  "/faq",
  "/privacy",
  "/cookies",
  "/terms",
  "/my-sweeps",
  "/winners",
  "/host",
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticEntries: MetadataRoute.Sitemap = STATIC_PATHS.map((path) => ({
    url: `${APP_URL}${path}`,
    lastModified: new Date(),
  }));

  // Category hubs — one crawlable landing page per dictionary category.
  const hubEntries: MetadataRoute.Sitemap = CATEGORY_HUBS.map((hub) => ({
    url: `${APP_URL}/discover/${hub.slug}`,
    lastModified: new Date(),
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
