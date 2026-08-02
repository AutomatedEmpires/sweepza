import "server-only";
import {
  createServerSupabaseClient,
  createServiceRoleClient,
} from "@/lib/supabase/server";
import type { Listing, PrizeCategory } from "@/lib/types/listing";
import { dateOnlyVisibilityFloor } from "@/lib/ingestion/lifecycle";
import { PRIZE_CATEGORY_TO_CATEGORY_CODE, toListing } from "./adapters";
import type { EntryFrequency, LifecycleStatus } from "./enums";
import type { HostPublicRow, ListingRow, WinnerPostRow } from "./types";

// Lifecycle statuses a listing can hold AFTER having been publicly live.
// Seeker history (Won / Entered / Saved) must keep resolving these — a
// seeker's record of outcomes is permanent even when the sweepstake isn't.
// Draft / pending_review / rejected / held / inactive are deliberately
// excluded: those were never public and must not leak through history reads.
const ONCE_PUBLIC_LIFECYCLES: LifecycleStatus[] = [
  "active",
  "paused",
  "expired",
  "archived",
];

/**
 * Every listing column a client role may read — the mirror of the column
 * allowlist granted in 20260801160000. The operator note columns
 * (review_notes, review_notes_internal, sponsor_notes_internal) are absent by
 * design; nothing on a public surface renders them, and they are not granted
 * to anon/authenticated.
 *
 * This must stay in sync with that grant. If a column is added to the table
 * and to the grant, add it here too — a column selected without a grant fails
 * the query, and a column granted but unselected is simply unused.
 */
const PUBLIC_LISTING_COLUMNS = [
  "id",
  "slug",
  "title",
  "short_description",
  "long_description",
  "prize_name",
  "prize_value",
  "prize_currency",
  "prize_category",
  "winner_count",
  "main_image_url",
  "image_source_type",
  "image_alt_text",
  "category_fallback_image",
  "image_attribution",
  "entry_url",
  "official_rules_url",
  "start_date",
  "end_date",
  "entry_frequency",
  "entry_limit_notes",
  "eligibility_country",
  "eligibility_states",
  "age_requirement",
  "no_purchase_necessary",
  "source_type",
  "public_source_label",
  "created_by_role",
  "created_by_user_id",
  "host_id",
  "sponsor_name",
  "sponsor_url",
  "sponsor_logo_url",
  "lifecycle_status",
  "visibility_status",
  "moderation_status",
  "duplicate_status",
  "listing_verification_status",
  "is_featured",
  "created_at",
  "updated_at",
  "published_at",
].join(", ");

/** A listing row as read under a client role: no operator note columns. */
export type PublicListingRow = Omit<
  ListingRow,
  "review_notes" | "review_notes_internal" | "sponsor_notes_internal"
>;

export interface DiscoverFilters {
  categories?: string[];
  entryFrequencies?: EntryFrequency[];
  verifiedOnly?: boolean;
  limit?: number;
  /** Full-text search query (websearch syntax) */
  searchQuery?: string;
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
  // Accepts the client-role projection too: nothing here reads an operator
  // note column, so a row without them adapts identically.
  rows: PublicListingRow[],
  accessToken?: string,
  // Joins (host/tags/winners) run on this client when provided — the seeker
  // history path passes the service-role client so joins resolve for rows
  // the anon RLS policy can no longer see.
  client?: ReturnType<typeof createServerSupabaseClient>,
): Promise<Listing[]> {
  if (rows.length === 0) return [];

  const supabase = client ?? createServerSupabaseClient(accessToken);
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

// The public trust promise "every listing reviewed before it goes live"
// (lib/trust-copy.ts, FAQ) is enforced here, at the serving boundary: public
// reads only return rows a human has accepted (admin review flips
// host-submitted rows to 'reviewed'; admin imports are created 'reviewed' or
// 'verified'). Rows that are somehow active yet 'unreviewed' never render on
// a public surface.
const PUBLICLY_SERVABLE_REVIEW_STATUSES = ["reviewed", "verified"];

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
    // Explicit columns, not "*": this is the one listing query that runs under
    // a client role, and the operator note columns are not granted to it.
    // Postgres expands "*" before checking privileges, so a star select here
    // fails the whole query with 42501 rather than omitting those columns.
    .select(PUBLIC_LISTING_COLUMNS)
    .eq("visibility_status", "public")
    .eq("lifecycle_status", "active")
    .gte("end_date", dateOnlyVisibilityFloor())
    .not("moderation_status", "in", '("under_review","action_taken")')
    .in("listing_verification_status", PUBLICLY_SERVABLE_REVIEW_STATUSES);

  if (filters.categories?.length) {
    query = query.in("prize_category", filters.categories.map(toCategoryCode));
  }
  if (filters.entryFrequencies?.length) query = query.in("entry_frequency", filters.entryFrequencies);
  if (filters.verifiedOnly) query = query.eq("listing_verification_status", "verified");

  const searchQuery = filters.searchQuery?.trim();
  if (searchQuery) {
    query = query.textSearch("search_vector", searchQuery, {
      type: "websearch",
      config: "english",
    });
  }

  const { data, error } = await query
    .order("published_at", { ascending: false })
    .limit(filters.limit ?? 30)
    .returns<PublicListingRow[]>();

  if (error) throw new Error(`getPublicListings failed: ${error.message}`);
  return adaptListingRows(data ?? [], accessToken);
}

/**
 * Seeker-history lookup by id set. Unlike the public queries this keeps
 * resolving listings after they end (expired/paused/archived) so a seeker's
 * Won / Entered / Saved record is permanent. Runs on the service-role client
 * because anon RLS only exposes active listings; safety comes from the
 * explicit once-public predicates (never drafts or unreviewed submissions).
 */
export async function getSeekerHistoryListingsByIds(
  listingIds: string[],
): Promise<Listing[]> {
  if (listingIds.length === 0) return [];

  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("listing")
    .select("*")
    .eq("visibility_status", "public")
    .in("lifecycle_status", ONCE_PUBLIC_LIFECYCLES)
    .not("moderation_status", "in", '("under_review","action_taken")')
    .in("id", listingIds)
    .returns<ListingRow[]>();

  if (error) {
    throw new Error(`getSeekerHistoryListingsByIds failed: ${error.message}`);
  }

  return adaptListingRows(data ?? [], undefined, supabase);
}

/**
 * Fetch a single listing by slug for unauthenticated public detail/API reads.
 * Slugs are guessable, so keep this stricter than seeker-history id lookups:
 * only active public listings should resolve here.
 */
export async function getListingBySlug(slug: string): Promise<Listing | null> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("listing")
    .select("*")
    .eq("visibility_status", "public")
    .eq("lifecycle_status", "active")
    .gte("end_date", dateOnlyVisibilityFloor())
    .in("listing_verification_status", PUBLICLY_SERVABLE_REVIEW_STATUSES)
    .not("moderation_status", "in", '("under_review","action_taken")')
    .eq("slug", slug)
    .maybeSingle<ListingRow>();
  if (error) throw new Error(`getListingBySlug failed: ${error.message}`);
  if (!data) return null;
  const [listing] = await adaptListingRows([data], undefined, supabase);
  return listing ?? null;
}
