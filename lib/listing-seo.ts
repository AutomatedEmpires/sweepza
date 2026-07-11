import { APP_NAME, SITE_URL } from "@/lib/site";
import type { Listing } from "@/lib/types/listing";

export function listingPath(slug: string): string {
  return `/sweeps/${encodeURIComponent(slug)}`;
}

export function listingOgImagePath(slug: string): string {
  return `/api/og/sweeps/${encodeURIComponent(slug)}`;
}

/**
 * Describe the public page without presenting a sweepstakes as a ticketed
 * Event. Sweepstakes do not meet Google's Event eligibility requirements, so
 * the generic WebPage vocabulary is the truthful structured-data boundary.
 */
export function buildListingJsonLd(listing: Listing, canonicalUrl: string) {
  const imageUrl = listing.mainImageUrl ?? listing.categoryFallbackImageUrl;

  return {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: listing.title,
    description: listing.shortDescription,
    url: canonicalUrl,
    isPartOf: {
      "@type": "WebSite",
      name: APP_NAME,
      url: SITE_URL.toString(),
    },
    ...(imageUrl
      ? {
          primaryImageOfPage: {
            "@type": "ImageObject",
            url: imageUrl,
          },
        }
      : {}),
    ...(listing.publishedAt ? { datePublished: listing.publishedAt } : {}),
  };
}

/**
 * JSON.stringify alone does not make inline JSON-LD safe: an untrusted
 * `</script>` substring can still terminate the HTML raw-text element. Escape
 * `<` as recommended by Next.js before passing the payload to React.
 */
export function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}
