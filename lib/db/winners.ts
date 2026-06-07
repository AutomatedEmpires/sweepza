import "server-only";

import { createServerSupabaseClient, createServiceRoleClient } from "@/lib/supabase/server";
import type { ReactionType, WinnerReviewStatus } from "@/lib/db/enums";
import type { WinnerPost } from "@/lib/types/winner";
import type { AppUserRow, ListingRow, WinnerPostRow, WinnerReactionRow } from "@/lib/db/types";
import { toWinnerPost } from "@/lib/db/adapters";

export type WinnerFeedCursor = { createdAt: string; id: string };

export interface GetPublishedWinnerPostsArgs {
  limit?: number;
  cursor?: WinnerFeedCursor;
}

type WinnerPostJoinRow = WinnerPostRow & {
  app_user: Pick<AppUserRow, "display_name" | "cover_image_url"> | null;
  listing: Pick<ListingRow, "slug" | "title" | "prize_value"> | null;
};

export async function getPublishedWinnerPosts(
  args: GetPublishedWinnerPostsArgs = {},
): Promise<{ posts: WinnerPost[]; nextCursor: WinnerFeedCursor | null }> {
  const supabase = createServerSupabaseClient();
  const limit = args.limit ?? 20;

  let base = supabase
    .from("winner_post")
    .select(
      [
        "id",
        "app_user_id",
        "listing_id",
        "caption",
        "photo_url",
        "review_status",
        "created_at",
        "updated_at",
        "app_user:app_user(display_name, cover_image_url)",
        "listing:listing(slug, title, prize_value)",
      ].join(","),
    )
    .eq("review_status", "published" satisfies WinnerReviewStatus)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });

  if (args.cursor) {
    // Cursor as (created_at, id) tuple — applied before limit/returns.
    base = base.or(
      `created_at.lt.${args.cursor.createdAt},and(created_at.eq.${args.cursor.createdAt},id.lt.${args.cursor.id})`,
    );
  }

  const { data, error } = await base.limit(limit + 1).returns<WinnerPostJoinRow[]>();
  if (error) throw new Error(`getPublishedWinnerPosts failed: ${error.message}`);
  const rows = data ?? [];

  const pageRows = rows.slice(0, limit);
  const reactionCounts = await getWinnerReactionCounts(
    pageRows.map((row) => row.id),
  );

  const posts = pageRows.map((row) => {
    const winnerDisplayName = row.app_user?.display_name ?? "Sweepza member";
    const listingSlug = row.listing?.slug ?? "";

    return {
      ...toWinnerPost(row, {
        winnerDisplayName,
        listingSlug,
        verifiedWin: false,
        reactions: reactionCounts.get(row.id) ?? {},
      }),
      // augment
      winnerAvatarUrl: row.app_user?.cover_image_url ?? undefined,
      listingTitle: row.listing?.title ?? undefined,
      listingPrizeValue: row.listing?.prize_value ?? null,
    } satisfies WinnerPost;
  });

  const next = rows.length > limit ? rows[limit] : null;
  const nextCursor = next ? { createdAt: next.created_at, id: next.id } : null;

  return { posts, nextCursor };
}

export async function getWinnerReactionCounts(
  winnerPostIds: string[],
): Promise<Map<string, Partial<Record<ReactionType, number>>>> {
  const map = new Map<string, Partial<Record<ReactionType, number>>>();
  if (winnerPostIds.length === 0) return map;

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("winner_reaction")
    .select("winner_post_id, reaction_type")
    .in("winner_post_id", winnerPostIds)
    .returns<Pick<WinnerReactionRow, "winner_post_id" | "reaction_type">[]>();

  if (error) throw new Error(`getWinnerReactionCounts failed: ${error.message}`);

  for (const row of data ?? []) {
    const counts = map.get(row.winner_post_id) ?? {};
    counts[row.reaction_type] = (counts[row.reaction_type] ?? 0) + 1;
    map.set(row.winner_post_id, counts);
  }

  return map;
}

export async function listPendingWinnerPostsForModeration(): Promise<WinnerPostRow[]> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("winner_post")
    .select("*")
    .in("review_status", ["submitted", "pending_review"])
    .order("created_at", { ascending: true })
    .returns<WinnerPostRow[]>();
  if (error) throw new Error(`listPendingWinnerPostsForModeration failed: ${error.message}`);
  return data ?? [];
}

export async function updateWinnerPostReviewStatus(args: {
  winnerPostId: string;
  reviewStatus: WinnerReviewStatus;
}): Promise<void> {
  const supabase = createServiceRoleClient();
  const { error } = await supabase
    .from("winner_post")
    .update({ review_status: args.reviewStatus })
    .eq("id", args.winnerPostId);
  if (error) throw new Error(`updateWinnerPostReviewStatus failed: ${error.message}`);
}
