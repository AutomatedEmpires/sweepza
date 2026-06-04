import { ListingCard } from "@/components/listing-card";
import { MOCK_LISTINGS } from "@/lib/mock/listings";

export const metadata = { title: "Browse" };

export default function ListingsPage() {
  return (
    <section className="px-4 pb-8 pt-8">
      <header className="mb-4 flex flex-col gap-1 px-1">
        <h1 className="text-2xl font-bold text-ink">Browse</h1>
        <p className="text-sm text-ink/60">
          {MOCK_LISTINGS.length} sweepstakes worth entering. Cards render mock
          data (Lane C); the live Discover feed and filters arrive in Lane D.
        </p>
      </header>
      <div className="flex flex-col gap-4">
        {MOCK_LISTINGS.map((listing) => (
          <ListingCard key={listing.id} listing={listing} />
        ))}
      </div>
    </section>
  );
}
