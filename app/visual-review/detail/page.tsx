import { notFound } from "next/navigation";
import { ListingDetail } from "@/components/listing-detail";
import { buildFixtureListings } from "@/lib/fixtures/listings";

export const metadata = { title: "Visual review · Detail", robots: { index: false } };
export const dynamic = "force-dynamic";

// Detail-surface preview against a rich fixture. Gated off real production.
export default async function VisualReviewDetailPage({
  searchParams,
}: {
  searchParams?: Promise<{ slug?: string }>;
}) {
  if (process.env.VERCEL_ENV === "production") notFound();

  const listings = buildFixtureListings(new Date());
  const slug = (await searchParams)?.slug;
  const listing = listings.find((l) => l.slug === slug) ?? listings[1]; // Island Escape by default

  return (
    <ListingDetail listing={listing} clerkConfigured={false} isSignedIn={false} />
  );
}
