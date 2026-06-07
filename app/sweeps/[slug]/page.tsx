import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ensureCurrentAppUser, isClerkConfigured } from "@/lib/auth";
import { ListingDetail } from "@/components/listing-detail";
import { getListingBySlug } from "@/lib/db/listings";
import { APP_NAME, SITE_URL } from "@/lib/site";
import type { Listing } from "@/lib/types/listing";

export const dynamic = "force-dynamic";

/**
 * Build schema.org structured data for a sweepstakes listing.
 *
 * Sweepstakes are modeled as a promotional `Event` with a zero-cost `Offer`.
 * Only fields that exist on the canonical `Listing` type are used. `Listing`
 * has no `hostName`; the organizer name falls back to the related host's name
 * (when present) and then to `APP_NAME`.
 */
function buildListingJsonLd(listing: Listing, canonicalUrl: string): string {
  const json = {
    "@context": "https://schema.org",
    "@type": "Event",
    name: listing.title,
    description: listing.shortDescription ?? listing.title,
    url: canonicalUrl,
    eventStatus: "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OnlineEventAttendanceMode",
    ...(listing.endDate ? { endDate: listing.endDate } : {}),
    organizer: {
      "@type": "Organization",
      name: listing.host?.name ?? APP_NAME,
    },
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
      availability: "https://schema.org/InStock",
    },
    ...(listing.prizeValue ? { prize: `USD ${listing.prizeValue}` } : {}),
  };
  return JSON.stringify(json);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const listing = await getListingBySlug(slug);
  if (!listing) return { title: "Sweepstakes not found" };

  const canonicalUrl = new URL(`/sweeps/${slug}`, SITE_URL).toString();
  const ogImageUrl = new URL(`/api/og/sweeps/${slug}`, SITE_URL).toString();

  return {
    title: listing.title,
    description: listing.shortDescription,
    alternates: { canonical: `/sweeps/${slug}` },
    openGraph: {
      title: listing.title,
      description: listing.shortDescription ?? undefined,
      url: canonicalUrl,
      type: "article",
      siteName: APP_NAME,
      images: [
        {
          url: ogImageUrl,
          width: 1200,
          height: 630,
          alt: listing.title,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: listing.title,
      description: listing.shortDescription ?? undefined,
      images: [ogImageUrl],
    },
  };
}

export default async function ListingDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const listing = await getListingBySlug(slug);
  if (!listing) notFound();

  const canonicalUrl = new URL(`/sweeps/${listing.slug}`, SITE_URL).toString();
  const jsonLd = buildListingJsonLd(listing, canonicalUrl);
  // Safe: jsonLd is built server-side from DB-sourced fields via JSON.stringify.
  // No user-controllable string is inserted as raw HTML.
  const jsonLdHtml = { __html: jsonLd };

  const [authUser] = await Promise.all([ensureCurrentAppUser()]);
  const clerkConfigured = isClerkConfigured();

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLdHtml}
      />
      <ListingDetail
        listing={listing}
        clerkConfigured={clerkConfigured}
        isSignedIn={Boolean(authUser)}
      />
    </>
  );
}
