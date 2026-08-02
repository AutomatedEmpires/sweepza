import type { Metadata } from "next";
import { APP_NAME, APP_TAGLINE } from "@/lib/site";

/**
 * Next merges `metadata.openGraph` SHALLOWLY: a route that declares its own
 * openGraph block replaces the parent's entirely, and the file-convention
 * image from app/opengraph-image.tsx is not re-applied. Every route that set
 * its own openGraph therefore shipped with no og:image at all, and social
 * cards silently degraded from summary_large_image to a bare text summary.
 *
 * Routes call this instead of hand-writing the block, so the site card is
 * attached by construction rather than by each author remembering.
 * Listing detail opts out deliberately — it builds a per-listing card.
 */
export const SITE_OG_IMAGE = {
  url: "/opengraph-image",
  width: 1200,
  height: 630,
  alt: `${APP_NAME} — ${APP_TAGLINE}`,
} as const;

export function publicPageMetadata(input: {
  title: string;
  description: string;
  path: string;
  /** Defaults to `title`; set when the social card should read differently. */
  ogTitle?: string;
  /** Defaults to `description`. */
  ogDescription?: string;
  /**
   * Omit the explicit image so a route's own `opengraph-image.tsx` file
   * convention supplies the card — /discover/[category] renders a per-hub
   * card, and naming the site image here would silently replace it.
   */
  useRouteImage?: boolean;
}): Metadata {
  const ogTitle = input.ogTitle ?? input.title;
  const ogDescription = input.ogDescription ?? input.description;
  const images = input.useRouteImage ? undefined : [SITE_OG_IMAGE];

  return {
    title: input.title,
    description: input.description,
    alternates: { canonical: input.path },
    openGraph: {
      title: ogTitle,
      description: ogDescription,
      url: input.path,
      type: "website",
      siteName: APP_NAME,
      ...(images ? { images } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title: ogTitle,
      description: ogDescription,
      ...(images ? { images: images.map((image) => image.url) } : {}),
    },
  };
}
