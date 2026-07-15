import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ensureCurrentAppUser, isClerkConfigured } from "@/lib/auth";
import { ListingDetail } from "@/components/listing-detail";
import { getCachedListingBySlug } from "@/lib/db/listings-cache";
import {
  buildListingJsonLd,
  listingOgImagePath,
  listingPath,
  serializeJsonLd,
} from "@/lib/listing-seo";
import { APP_NAME, SITE_URL } from "@/lib/site";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const listing = await getCachedListingBySlug(slug);
  if (!listing) return { title: "Sweepstakes not found" };

  const canonicalUrl = new URL(listingPath(listing.slug), SITE_URL);
  const ogImageUrl = new URL(listingOgImagePath(listing.slug), SITE_URL);

  return {
    title: listing.title,
    description: listing.shortDescription,
    alternates: { canonical: canonicalUrl },
    openGraph: {
      title: listing.title,
      description: listing.shortDescription,
      url: canonicalUrl,
      type: "website",
      siteName: APP_NAME,
      images: [
        {
          url: ogImageUrl,
          width: 1200,
          height: 630,
          alt: listing.title,
          type: "image/png",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: listing.title,
      description: listing.shortDescription,
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
  const listing = await getCachedListingBySlug(slug);
  if (!listing) notFound();

  const canonicalUrl = new URL(listingPath(listing.slug), SITE_URL).toString();
  const jsonLd = serializeJsonLd(buildListingJsonLd(listing, canonicalUrl));
  const [authUser] = await Promise.all([ensureCurrentAppUser()]);
  const clerkConfigured = isClerkConfigured();

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd }}
      />
      <ListingDetail
        listing={listing}
        clerkConfigured={clerkConfigured}
        isSignedIn={Boolean(authUser)}
      />
    </>
  );
}
