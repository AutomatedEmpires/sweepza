import { ListingCard } from "@/components/listing-card";
import { getPublicListings } from "@/lib/db/listings";

export const metadata = { title: "Browse" };
export const dynamic = "force-dynamic";

export default async function ListingsPage() {
  const listings = await getPublicListings({ limit: 100 });

  return (
    <section className="px-4 pb-8 pt-8">
      <header className="mb-4 flex flex-col gap-1 px-1">
        <h1 className="text-2xl font-bold text-ink">Browse</h1>
        <p className="text-sm text-ink/60">
          {listings.length} live sweepstakes worth entering.
        </p>
      </header>
      <div className="flex flex-col gap-4">
        {listings.map((listing) => (
          <ListingCard key={listing.id} listing={listing} />
        ))}
      </div>
    </section>
  );
}
