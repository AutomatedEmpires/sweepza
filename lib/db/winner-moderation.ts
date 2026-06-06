import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/server";
import type { WinnerPostRow } from "./types";

export interface WinnerModerationItem {
  id: string;
  caption: string | null;
  photo_url: string | null;
  verified_win: boolean;
  review_status: string;
  created_at: string;
  app_user_id: string;
  listing_id: string | null;
  winner_display_name: string | null;
  listing_title: string | null;
  listing_slug: string | null;
}

// Posts that are actionable in the moderation workspace: anything awaiting a
// decision or currently live (so admins can hide it). Draft and rejected posts
// are intentionally excluded from the operational queue.
const WINNER_QUEUE_STATUSES = [
  "submitted",
  "pending_review",
  "published",
  "hidden",
] as const;

type RawWinnerRow = {
  id: string;
  caption: string | null;
  photo_url: string | null;
  verified_win: boolean;
  review_status: string;
  created_at: string;
  app_user_id: string;
  listing_id: string | null;
  app_user:
    | { display_name: string | null }
    | { display_name: string | null }[]
    | null;
  listing:
    | { title: string; slug: string }
    | { title: string; slug: string }[]
    | null;
};

// Service-role read; callers MUST verify is_admin/is_owner before invoking.
export async function getWinnerModerationQueue(): Promise<WinnerModerationItem[]> {
  const supabase = createServiceRoleClient();

  const { data, error } = await supabase
    .from("winner_post")
    .select(
      `id, caption, photo_url, verified_win, review_status, created_at,
       app_user_id, listing_id,
       app_user:app_user_id ( display_name ),
       listing:listing_id ( title, slug )`,
    )
    .in("review_status", WINNER_QUEUE_STATUSES)
    .order("created_at", { ascending: false })
    .returns<RawWinnerRow[]>();

  if (error) {
    throw new Error(`getWinnerModerationQueue failed: ${error.message}`);
  }

  return (data ?? []).map((row) => {
    const user = Array.isArray(row.app_user) ? row.app_user[0] : row.app_user;
    const listing = Array.isArray(row.listing) ? row.listing[0] : row.listing;
    return {
      id: row.id,
      caption: row.caption,
      photo_url: row.photo_url,
      verified_win: row.verified_win,
      review_status: row.review_status,
      created_at: row.created_at,
      app_user_id: row.app_user_id,
      listing_id: row.listing_id,
      winner_display_name: user?.display_name ?? null,
      listing_title: listing?.title ?? null,
      listing_slug: listing?.slug ?? null,
    };
  });
}

export async function getWinnerPostById(
  winnerPostId: string,
): Promise<WinnerPostRow | null> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("winner_post")
    .select("*")
    .eq("id", winnerPostId)
    .maybeSingle<WinnerPostRow>();

  if (error) {
    throw new Error(`getWinnerPostById failed: ${error.message}`);
  }

  return data;
}
