import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ListingDetail } from "@/components/listing-detail";
import { MOCK_LISTINGS } from "@/lib/mock/listings";

// Lane B will swap this mock lookup for getListingBySlug() against Supabase.
function findListing(slug: string) {
  return MOCK_LISTINGS.find((listing) => listing.slug === slug);
}

export function generateStaticParams() {
  return MOCK_LISTINGS.map((listing) => ({ slug: listing.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const listing = findListing(slug);
  if (!listing) return { title: "Sweepstakes not found" };
  return {
    title: listing.title,
    description: listing.shortDescription,
  };
}

export default async function ListingDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const listing = findListing(slug);
  if (!listing) notFound();
  return <ListingDetail listing={listing} />;
}
