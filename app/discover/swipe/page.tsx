import type { Metadata } from "next";
import { DiscoverModeToggle } from "@/components/discover-mode-toggle";
import { SwipeDeck } from "@/components/swipe-deck-loader";
import { parseCategoryFilter } from "@/lib/category-hubs";
import { getPublicListings } from "@/lib/db/listings";
import { getCachedPublicListings } from "@/lib/db/listings-cache";
import { withPublicFallback } from "@/lib/db/resilient";
import { isExpired } from "@/lib/listing-badges";
import {
  filterListings,
  parseFilterIds,
  parseSortId,
  sortListings,
} from "@/lib/listing-filters";

export const metadata: Metadata = { title: "Swipe" };
export const dynamic = "force-dynamic";

// Swipe mode of the unified Discover system — same inventory, same query
// dimension, one decision at a time.
export default async function SwipePage({
  searchParams,
}: {
  searchParams?: Promise<{
    q?: string | string[];
    category?: string | string[];
    filters?: string | string[];
    sort?: string | string[];
  }>;
}) {
  const params = await searchParams;
  const q = typeof params?.q === "string" ? params.q.trim().slice(0, 200) : "";
  const category = parseCategoryFilter(params?.category);
  const activeFilters = parseFilterIds(params?.filters);
  const sort = parseSortId(params?.sort);

  // The unfiltered deck shares Discover's cached feed; searches stay
  // per-request. Either way a feed failure degrades to the deck's designed
  // "all caught up" state.
  const inventory = (
    await withPublicFallback(
      q || category
        ? getPublicListings({
            searchQuery: q || undefined,
            categories: category ? [category] : undefined,
            limit: 60,
          })
        : getCachedPublicListings(60),
      [],
      "swipe_deck",
    )
  ).filter((listing) => !isExpired(listing));
  const deck = sortListings(
    filterListings(inventory, activeFilters),
    sort,
  );

  return (
    <section className="flex flex-col pt-6 lg:mx-auto lg:max-w-7xl lg:px-8">
      <header className="mb-2 flex items-start justify-between gap-3 px-5 lg:px-0">
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-[26px] leading-none text-ink">Discover</h1>
          <p className="text-sm text-graphite">
            {q
              ? `Swiping results for “${q}”.`
              : activeFilters.length > 0 || category
                ? `${deck.length} filtered ${deck.length === 1 ? "listing" : "listings"} — one at a time.`
                : "Pass, save, or open the official source — one sweep at a time."}
          </p>
        </div>
        <DiscoverModeToggle />
      </header>
      <SwipeDeck listings={deck} />
    </section>
  );
}
