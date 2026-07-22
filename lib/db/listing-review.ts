import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/server";
import type { ListingRow } from "./types";

export interface ReviewQueueListing {
  id: string;
  slug: string;
  title: string;
  short_description: string;
  prize_name: string;
  prize_category: string | null;
  main_image_url: string | null;
  official_rules_url: string | null;
  entry_url: string | null;
  end_date: string | null;
  entry_frequency: string | null;
  eligibility_country: string | null;
  lifecycle_status: string;
  visibility_status: string;
  moderation_status: string;
  listing_verification_status: string;
  review_notes_internal: string | null;
  created_at: string;
  host_id: string | null;
  host_display_name: string | null;
  source_type: string;
}

const REVIEW_QUEUE_STATUSES = ["draft", "pending_review", "held"] as const;

type RawReviewRow = Omit<ReviewQueueListing, "host_display_name"> & {
  host: { display_name: string } | { display_name: string }[] | null;
};

// Owner/admin review queue: host and official-source ingestion drafts awaiting
// a human publication decision.
// Service-role read; callers MUST verify is_admin/is_owner before invoking.
export async function getHostReviewQueue(): Promise<ReviewQueueListing[]> {
  const supabase = createServiceRoleClient();

  const { data, error } = await supabase
    .from("listing")
    .select(
      `id, slug, title, short_description, prize_name, prize_category,
       main_image_url, official_rules_url, entry_url,
       end_date, entry_frequency, eligibility_country, lifecycle_status,
       visibility_status, moderation_status, listing_verification_status,
       review_notes_internal, created_at, host_id, source_type,
       host:host_id ( display_name )`,
    )
    .in("lifecycle_status", REVIEW_QUEUE_STATUSES)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`getHostReviewQueue failed: ${error.message}`);
  }

  return ((data ?? []) as RawReviewRow[]).map((row) => {
    const host = Array.isArray(row.host) ? row.host[0] : row.host;
    return {
      id: row.id,
      slug: row.slug,
      title: row.title,
      short_description: row.short_description,
      prize_name: row.prize_name,
      prize_category: row.prize_category,
      main_image_url: row.main_image_url,
      official_rules_url: row.official_rules_url,
      entry_url: row.entry_url,
      end_date: row.end_date,
      entry_frequency: row.entry_frequency,
      eligibility_country: row.eligibility_country,
      lifecycle_status: row.lifecycle_status,
      visibility_status: row.visibility_status,
      moderation_status: row.moderation_status,
      listing_verification_status: row.listing_verification_status,
      review_notes_internal: row.review_notes_internal,
      created_at: row.created_at,
      host_id: row.host_id,
      host_display_name: host?.display_name ?? null,
      source_type: row.source_type,
    };
  });
}

export async function getReviewListingById(
  listingId: string,
): Promise<ListingRow | null> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("listing")
    .select("*")
    .eq("id", listingId)
    .maybeSingle<ListingRow>();

  if (error) {
    throw new Error(`getReviewListingById failed: ${error.message}`);
  }

  return data;
}
