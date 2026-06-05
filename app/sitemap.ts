import type { MetadataRoute } from "next";
import { getPublicListings } from "@/lib/db/listings";
import { APP_URL } from "@/lib/site";

const STATIC_PATHS = [
  "",
  "/discover",
  "/discover/swipe",
  "/listings",
  "/about",
  "/privacy",
  "/terms",
  "/saved",
  "/winners",
  "/host",
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticEntries: MetadataRoute.Sitemap = STATIC_PATHS.map((path) => ({
    url: `${APP_URL}${path}`,
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

    return [...staticEntries, ...listingEntries];
  } catch {
    return staticEntries;
  }
}
