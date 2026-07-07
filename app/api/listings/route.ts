import { NextRequest, NextResponse } from "next/server";
import { getPublicListings, getPublicListingsByIds } from "@/lib/db/listings";
import {
  FILTER_CHIPS,
  SORT_OPTIONS,
  filterListings,
  sortListings,
  type FilterChipId,
  type SortId,
} from "@/lib/listing-filters";
import type { EntryFrequency } from "@/lib/db/enums";

const VALID_CHIPS = new Set<FilterChipId>(FILTER_CHIPS.map((chip) => chip.id));
const VALID_SORTS = new Set<SortId>(SORT_OPTIONS.map((option) => option.id));
const VALID_ENTRY_FREQUENCIES = new Set<EntryFrequency>([
  "one_time",
  "daily",
  "weekly",
  "monthly",
  "instant_win",
  "other",
]);

function parseList(values: string[]): string[] {
  return values
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter(Boolean);
}

export const dynamic = "force-dynamic";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_IDS = 100;

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;

  // Direct lookup by id set (e.g. My Sweeps hydrating a local seeker's
  // touched listings). RLS still applies — only public/active rows return.
  const ids = parseList(searchParams.getAll("ids"))
    .filter((value) => UUID_PATTERN.test(value))
    .slice(0, MAX_IDS);
  if (ids.length > 0) {
    const listings = await getPublicListingsByIds(ids);
    return NextResponse.json({
      data: listings,
      meta: { count: listings.length, ids },
    });
  }

  const categories = parseList(searchParams.getAll("category"));
  const entryFrequencies = parseList(searchParams.getAll("entryFrequency")).filter(
    (value): value is EntryFrequency => VALID_ENTRY_FREQUENCIES.has(value as EntryFrequency),
  );
  const chips = parseList(searchParams.getAll("chip")).filter(
    (value): value is FilterChipId => VALID_CHIPS.has(value as FilterChipId),
  );

  const rawSort = searchParams.get("sort");
  const sort: SortId = VALID_SORTS.has(rawSort as SortId)
    ? (rawSort as SortId)
    : "recommended";

  const q = searchParams.get("q")?.trim() ?? "";
  const verifiedOnly = searchParams.get("verifiedOnly") === "true";

  const parsedLimit = Number(searchParams.get("limit") ?? "30");
  const limit = Number.isFinite(parsedLimit)
    ? Math.min(Math.max(Math.trunc(parsedLimit), 1), 100)
    : 30;

  let listings = await getPublicListings({
    categories: categories.length > 0 ? categories : undefined,
    entryFrequencies: entryFrequencies.length > 0 ? entryFrequencies : undefined,
    verifiedOnly,
    limit,
    searchQuery: q || undefined,
  });

  listings = filterListings(listings, chips);
  listings = sortListings(listings, sort);

  return NextResponse.json({
    data: listings,
    meta: {
      count: listings.length,
      query: q,
      sort,
      filters: {
        categories,
        entryFrequencies,
        chips,
        verifiedOnly,
      },
    },
  });
}
