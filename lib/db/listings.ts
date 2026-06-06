import "server-only";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Listing, PrizeCategory } from "@/lib/types/listing";
import { PRIZE_CATEGORY_TO_CATEGORY_CODE, toListing } from "./adapters";
import type { EntryFrequency } from "./enums";
import type { HostPublicRow, ListingRow, WinnerPostRow } from "./types";

export interface DiscoverFilters {
  categories?: string[];
  entryFrequencies?: EntryFrequency[];
  verifiedOnly?: boolean;
  limit?: number;
}

interface ListingTagLabelRow {
  listing_id: string;
  tag: { label: string } | { label: string }[] | null;
}

type PublishedWinnerPostRow = Pick<WinnerPostRow, "listing_id">;

function toCategoryCode(category: string): string {
  return PRIZE_CATEGORY_TO_CATEGORY_CODE[category as PrizeCategory] ?? category;
}

function getTagLabel(tag: ListingTagLabelRow["tag"]): string | undefined {
  if (!tag) return undefined;
  return Array.isArray(tag) ? tag[0]?.label : tag.label;
}

export async function adaptListingRows(
  rows: ListingRow[],
  accessToken?: string,
): Promise<Listing[]> {
  if (rows.length === 0) return [];

  const supabase = createServerSupabaseClient(accessToken);
  const listingIds = rows.map((row) => row.id);
  const hostIds = [...new Set(rows.flatMap((row) => (row.host_id ? [row.host_id] : [])))];

  const hostsTask = (async () => {
    if (hostIds.length === 0) return [] as HostPublicRow[];
    const { data, error } = await supabase
      .from("host_public")
      .select("*")
      .in("id", hostIds)
      .returns<HostPublicRow[]>();

    if (error) throw new Error(`getPublicListings host lookup failed: ${error.message}`);
    return data ?? [];
  })();

  const tagsTask = (async () => {
    const { data, error } = await supabase
      .from("listing_tag")
      .select("listing_id, tag:tag(label)")
      .in("listing_id", listingIds)
      .returns<ListingTagLabelRow[]>();

    if (error) throw new Error(`getPublicListings tag lookup failed: ${error.message}`);
    return data ?? [];
  })();

  const winnersTask = (async () => {
    const { data, error } = await supabase
      .from("winner_post")
      .select("listing_id")
      .eq("review_status", "published")
      .in("listing_id", listingIds)
      .returns<PublishedWinnerPostRow[]>();

    if (error) throw new Error(`getPublicListings winner lookup failed: ${error.message}`);
    return data ?? [];
  })();

  const [hosts, tagRows, winnerPosts] = await Promise.all([
    hostsTask,
    tagsTask,
    winnersTask,
  ]);

  const hostsById = new Map(hosts.map((host) => [host.id, host]));
  const tagLabelsByListingId = new Map<string, string[]>();
  for (const row of tagRows) {
    const label = getTagLabel(row.tag);
    if (!label) continue;
    const labels = tagLabelsByListingId.get(row.listing_id);
    if (labels) {
      labels.push(label);
      continue;
    }
    tagLabelsByListingId.set(row.listing_id, [label]);
  }

  const winnerReportedListingIds = new Set(
    winnerPosts.flatMap((row) => (row.listing_id ? [row.listing_id] : [])),
  );

  return rows.map((row) =>
    toListing(row, {
      host: row.host_id ? hostsById.get(row.host_id) ?? null : null,
      tagLabels: tagLabelsByListingId.get(row.id),
      winnerReported: winnerReportedListingIds.has(row.id),
    }),
  );
}

/**
 * Public Discover feed. RLS already restricts rows to public + active +
 * non-under_review/action_taken; the explicit predicates are defense-in-depth
 * and make query intent clear.
 */
export async function getPublicListings(
  filters: DiscoverFilters = {},
  accessToken?: string,
): Promise<Listing[]> {
  const supabase = createServerSupabaseClient(accessToken);
  let query = supabase
    .from("listing")
    .select("*")
    .eq("visibility_status", "public")
    .eq("lifecycle_status", "active");

  if (filters.categories?.length) {
    query = query.in("prize_category", filters.categories.map(toCategoryCode));
  }
  if (filters.entryFrequencies?.length) query = query.in("entry_frequency", filters.entryFrequencies);
  if (filters.verifiedOnly) query = query.eq("listing_verification_status", "verified");

  const { data, error } = await query
    .order("published_at", { ascending: false })
    .limit(filters.limit ?? 30)
    .returns<ListingRow[]>();

  if (error) throw new Error(`getPublicListings failed: ${error.message}`);
  return adaptListingRows(data ?? [], accessToken);
}

export async function getPublicListingsByIds(
  listingIds: string[],
  accessToken?: string,
): Promise<Listing[]> {
  if (listingIds.length === 0) return [];

  const supabase = createServerSupabaseClient(accessToken);
  const { data, error } = await supabase
    .from("listing")
    .select("*")
    .eq("visibility_status", "public")
    .eq("lifecycle_status", "active")
    .in("id", listingIds)
    .returns<ListingRow[]>();

  if (error) {
    throw new Error(`getPublicListingsByIds failed: ${error.message}`);
  }

  return adaptListingRows(data ?? [], accessToken);
}

/** Fetch a single listing by slug (RLS still applies). */
export async function getListingBySlug(
  slug: string,
  accessToken?: string,
): Promise<Listing | null> {
  const supabase = createServerSupabaseClient(accessToken);
  const { data, error } = await supabase
    .from("listing")
    .select("*")
    .eq("visibility_status", "public")
    .eq("lifecycle_status", "active")
    .eq("slug", slug)
    .maybeSingle<ListingRow>();
  if (error) throw new Error(`getListingBySlug failed: ${error.message}`);
  if (!data) return null;
  const [listing] = await adaptListingRows([data], accessToken);
  return listing ?? null;
}
