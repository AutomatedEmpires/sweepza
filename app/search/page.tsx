import { z } from "zod";
import { ListingCard } from "@/components/listing-card";
import { SearchInput } from "@/components/search-input";
import { getPublicListings } from "@/lib/db/listings";
import { track } from "@/lib/analytics";

export const metadata = { title: "Search" };
export const dynamic = "force-dynamic";

const SearchParamsSchema = z.object({
  q: z.string().min(1).max(200).optional(),
  category: z.string().optional(),
});

function ListingCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-card border border-sand bg-cream shadow-sm">
      <div className="aspect-[4/3] w-full animate-pulse bg-sand" />
      <div className="-mt-4 rounded-t-[1.75rem] bg-cream px-4 pb-4 pt-4">
        <div className="h-5 w-4/5 animate-pulse rounded bg-sand/70" />
        <div className="mt-2 h-3 w-2/5 animate-pulse rounded bg-sand/60" />
        <div className="mt-4 h-10 w-full animate-pulse rounded-full bg-sand/50" />
      </div>
    </div>
  );
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const parsed = SearchParamsSchema.safeParse({
    q: typeof params?.q === "string" ? params.q : undefined,
    category: typeof params?.category === "string" ? params.category : undefined,
  });

  const q = parsed.success ? parsed.data.q?.trim() : undefined;
  const category = parsed.success ? parsed.data.category : undefined;

  const listings = await getPublicListings({
    searchQuery: q,
    categories: category ? [category] : undefined,
    limit: 40,
  });

  if (q) {
    track("search_results_shown", { query: q, result_count: listings.length });
  }

  const countLabel =
    q && listings.length > 0
      ? `${listings.length} sweepstakes matching “${q}”`
      : `${listings.length} sweepstakes`;

  return (
    <section className="px-4 pb-8 pt-8">
      <header className="mb-4 flex flex-col gap-2 px-1">
        <h1 className="text-2xl font-bold text-ink">Search</h1>
        <p className="text-sm text-ink/60">
          Find sweeps fast — title, description, host, and category.
        </p>
        <SearchInput />
        <p className="text-xs text-ink/45">{countLabel}</p>
      </header>

      {q && listings.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-card border border-dashed border-sand bg-white/60 px-6 py-12 text-center">
          <p className="text-sm font-medium text-ink">No sweepstakes found</p>
          <p className="text-xs text-ink/55">
            Nothing matches &ldquo;{q}&rdquo;. Try fewer words, a different host name, or a broader category.
          </p>
        </div>
      ) : listings.length === 0 ? (
        <div className="flex flex-col gap-4">
          {Array.from({ length: 3 }).map((_, idx) => (
            <ListingCardSkeleton key={idx} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {listings.map((listing) => (
            <ListingCard key={listing.id} listing={listing} surface="scroll" />
          ))}
        </div>
      )}
    </section>
  );
}
