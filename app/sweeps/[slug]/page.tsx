import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ListingDetail } from "@/components/listing-detail";
import { getListingBySlug } from "@/lib/db/listings";
import { SITE_URL } from "@/lib/site";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const listing = await getListingBySlug(slug);
  if (!listing) return { title: "Sweepstakes not found" };
  return {
    title: listing.title,
    description: listing.shortDescription,
    alternates: { canonical: `/sweeps/${slug}` },
    openGraph: {
      title: listing.title,
      description: listing.shortDescription,
      url: new URL(`/sweeps/${slug}`, SITE_URL),
      type: "article",
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
  return <ListingDetail listing={listing} />;
}
