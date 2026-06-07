import Link from "next/link";
import { DiscoverFeed } from "@/components/discover-feed";
import { Icon } from "@/components/icon";
import { getPublicListings } from "@/lib/db/listings";

export const metadata = { title: "Discover" };
export const dynamic = "force-dynamic";

export default async function DiscoverPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.trim() : "";

  const listings = await getPublicListings({
    searchQuery: q || undefined,
  });

  return (
    <section className="px-4 pb-8 pt-8">
      <header className="mb-4 flex items-start justify-between gap-3 px-1">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold text-ink">Discover</h1>
          <p className="text-sm text-ink/60">
            Scroll the feed, filter fast, and track what you enter.
          </p>
        </div>
        <Link
          href="/discover/swipe"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-ink px-3.5 py-2 text-xs font-semibold text-cream transition hover:bg-ink/90"
        >
          <Icon name="repeat" size={14} /> Swipe
        </Link>
      </header>
      <DiscoverFeed listings={listings} />
    </section>
  );
}
