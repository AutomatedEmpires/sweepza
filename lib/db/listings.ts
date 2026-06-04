import "server-only";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { EntryFrequency } from "./enums";
import type { ListingRow } from "./types";

export interface DiscoverFilters {
  categories?: string[];
  entryFrequencies?: EntryFrequency[];
  verifiedOnly?: boolean;
  limit?: number;
}

/**
 * Public Discover feed. RLS already restricts rows to public + active +
 * non-under_review/action_taken; the explicit predicates are defense-in-depth
 * and make query intent clear.
 */
export async function getPublicListings(
  filters: DiscoverFilters = {},
  accessToken?: string,
): Promise<ListingRow[]> {
  const supabase = createServerSupabaseClient(accessToken);
  let query = supabase
    .from("listing")
    .select("*")
    .eq("visibility_status", "public")
    .eq("lifecycle_status", "active");

  if (filters.categories?.length) query = query.in("prize_category", filters.categories);
  if (filters.entryFrequencies?.length) query = query.in("entry_frequency", filters.entryFrequencies);
  if (filters.verifiedOnly) query = query.eq("listing_verification_status", "verified");

  const { data, error } = await query
    .order("published_at", { ascending: false })
    .limit(filters.limit ?? 30)
    .returns<ListingRow[]>();

  if (error) throw new Error(`getPublicListings failed: ${error.message}`);
  return data ?? [];
}

/** Fetch a single listing by slug (RLS still applies). */
export async function getListingBySlug(
  slug: string,
  accessToken?: string,
): Promise<ListingRow | null> {
  const supabase = createServerSupabaseClient(accessToken);
  const { data, error } = await supabase
    .from("listing")
    .select("*")
    .eq("slug", slug)
    .maybeSingle<ListingRow>();
  if (error) throw new Error(`getListingBySlug failed: ${error.message}`);
  return data ?? null;
}
