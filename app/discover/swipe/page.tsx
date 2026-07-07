import type { Metadata } from "next";
import { DiscoverModeToggle } from "@/components/discover-mode-toggle";
import { SwipeDeck } from "@/components/swipe-deck";
import { getPublicListings } from "@/lib/db/listings";
import { isExpired } from "@/lib/listing-badges";

export const metadata: Metadata = { title: "Swipe" };
export const dynamic = "force-dynamic";

// Swipe mode of the unified Discover system — same inventory, same query
// dimension, one decision at a time.
export default async function SwipePage({
  searchParams,
}: {
  searchParams?: Promise<{ q?: string | string[] }>;
}) {
  const params = await searchParams;
  const q = typeof params?.q === "string" ? params.q.trim().slice(0, 200) : "";

  const deck = (
    await getPublicListings({ searchQuery: q || undefined, limit: 60 })
  ).filter((listing) => !isExpired(listing));

  return (
    <section className="flex flex-col pt-6">
      <header className="mb-2 flex items-start justify-between gap-3 px-5">
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-3xl text-ink">Discover</h1>
          <p className="text-sm text-ink/60">
            {q
              ? `Swiping results for “${q}”.`
              : "Pass, save, or enter — one sweep at a time."}
          </p>
        </div>
        <DiscoverModeToggle />
      </header>
      <SwipeDeck listings={deck} />
    </section>
  );
}
