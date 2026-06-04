import { DiscoverFeed } from "@/components/discover-feed";
import { MOCK_LISTINGS } from "@/lib/mock/listings";

export const metadata = { title: "Discover" };

export default function DiscoverPage() {
  return (
    <section className="px-4 pb-8 pt-8">
      <header className="mb-4 flex flex-col gap-1 px-1">
        <h1 className="text-2xl font-bold text-ink">Discover</h1>
        <p className="text-sm text-ink/60">
          Scroll the feed, filter fast, and track what you enter.
        </p>
      </header>
      <DiscoverFeed listings={MOCK_LISTINGS} />
    </section>
  );
}
