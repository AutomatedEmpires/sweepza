import { DiscoverFeed } from "@/components/discover-feed";
import { DiscoverModeToggle } from "@/components/discover-mode-toggle";
import { getPublicListings } from "@/lib/db/listings";
import { withPublicFallback } from "@/lib/db/resilient";
import { serializeJsonLd } from "@/lib/listing-seo";
import { buildItemListJsonLd } from "@/lib/structured-data";
import { SITE_URL } from "@/lib/site";
import { getCachedPublicListings } from "@/lib/db/listings-cache";

export const metadata = { title: "Discover" };
export const dynamic = "force-dynamic";

// Discover — the single discovery system. Search is a dimension of it
// (?q full-text via Postgres), Swipe is an alternate mode of it, and the
// chip/filter/sort vocabulary is shared across both modes.
export default async function DiscoverPage({
  searchParams,
}: {
  searchParams?: Promise<{ q?: string | string[]; category?: string | string[] }>;
}) {
  const params = await searchParams;
  const q = typeof params?.q === "string" ? params.q.trim().slice(0, 200) : "";
  const category =
    typeof params?.category === "string" ? params.category : undefined;

  // The unfiltered feed is shared by every visitor, so serve it from the
  // cached path; search/category views are per-request and stay uncached.
  // Either way a data-layer failure degrades to the designed empty state.
  const listings = await withPublicFallback(
    q || category
      ? getPublicListings({
          searchQuery: q || undefined,
          categories: category ? [category] : undefined,
          limit: 60,
        })
      : getCachedPublicListings(60),
    [],
    "discover_feed",
  );

  const itemListJsonLd =
    listings.length > 0
      ? serializeJsonLd(
          buildItemListJsonLd(
            listings.map((listing) => ({
              name: listing.title,
              url: new URL(`/sweeps/${listing.slug}`, SITE_URL).toString(),
            })),
          ),
        )
      : null;

  return (
    <section className="px-4 pb-8 pt-8 lg:mx-auto lg:max-w-5xl lg:px-8">
      {itemListJsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: itemListJsonLd }}
        />
      )}
      <header className="mb-5 flex items-start justify-between gap-3 px-1">
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-[26px] leading-none text-ink">Discover</h1>
          <p className="text-sm text-graphite">
            {q
              ? `Results for “${q}” — title, prize, host, and tags.`
              : "Scroll the feed, filter fast, and track what you enter."}
          </p>
        </div>
        <DiscoverModeToggle />
      </header>
      <DiscoverFeed listings={listings} query={q} />
    </section>
  );
}
