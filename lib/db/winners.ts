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

type WinnerPostJoinRow = Pick<
  WinnerPostRow,
  | "id"
  | "app_user_id"
  | "listing_id"
  | "caption"
  | "photo_url"
  | "verified_win"
  | "review_status"
  | "created_at"
  | "updated_at"
> & {
  app_user: Pick<AppUserRow, "display_name"> | null;
  listing: Pick<ListingRow, "slug" | "title" | "prize_value"> | null;
};

export async function getPublishedWinnerPosts(
  args: GetPublishedWinnerPostsArgs = {},
): Promise<{ posts: WinnerPost[]; nextCursor: WinnerFeedCursor | null }> {
  // This server-only service query selects an explicit public projection.
  // The anonymous role cannot embed app_user, and must never receive winner
  // moderation notes or evidence fields.
  const supabase = createServiceRoleClient();
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
        "verified_win",
        "review_status",
        "created_at",
        "updated_at",
        "app_user:app_user(display_name)",
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
        reactions: reactionCounts.get(row.id) ?? {},
      }),
      // augment
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

export interface WinnerModerationQueueItem {
  id: string;
  appUserId: string;
  memberName: string;
  memberEmail: string | null;
  listingId: string;
  listingTitle: string;
  listingSlug: string;
  caption: string;
  photoUrl: string | null;
  reviewStatus: WinnerReviewStatus;
  createdAt: string;
}

type WinnerModerationJoinRow = WinnerPostRow & {
  app_user: Pick<AppUserRow, "display_name" | "email"> | null;
  listing: Pick<ListingRow, "title" | "slug"> | null;
};

export async function listPendingWinnerPostsForModeration(): Promise<WinnerModerationQueueItem[]> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("winner_post")
    .select(
      [
        "*",
        "app_user:app_user(display_name, email)",
        "listing:listing(title, slug)",
      ].join(","),
    )
    .in("review_status", ["submitted", "pending_review"])
    .order("created_at", { ascending: true })
    .returns<WinnerModerationJoinRow[]>();
  if (error) throw new Error(`listPendingWinnerPostsForModeration failed: ${error.message}`);
  return (data ?? []).map((row) => ({
    id: row.id,
    appUserId: row.app_user_id,
    memberName: row.app_user?.display_name ?? "Sweepza member",
    memberEmail: row.app_user?.email ?? null,
    listingId: row.listing_id,
    listingTitle: row.listing?.title ?? "Unavailable listing",
    listingSlug: row.listing?.slug ?? "",
    caption: row.caption,
    photoUrl: row.photo_url,
    reviewStatus: row.review_status,
    createdAt: row.created_at,
  }));
}

export async function toggleWinnerReaction(args: {
  winnerPostId: string;
  appUserId: string;
  reactionType: ReactionType;
}): Promise<{
  active: boolean;
  counts: Partial<Record<ReactionType, number>>;
}> {
  const supabase = createServiceRoleClient();

  const { data: post, error: postError } = await supabase
    .from("winner_post")
    .select("id")
    .eq("id", args.winnerPostId)
    .eq("review_status", "published")
    .maybeSingle<{ id: string }>();
  if (postError) {
    throw new Error(`winner reaction target lookup failed: ${postError.message}`);
  }
  if (!post) {
    throw new Error("Winner post is unavailable.");
  }

  const { data: existing } = await supabase
    .from("winner_reaction")
    .select("id")
    .eq("winner_post_id", args.winnerPostId)
    .eq("app_user_id", args.appUserId)
    .eq("reaction_type", args.reactionType)
    .maybeSingle();

  const active = !existing;
  if (existing) {
    const { error } = await supabase.from("winner_reaction").delete().eq("id", existing.id);
    if (error) throw new Error(`winner reaction delete failed: ${error.message}`);
  } else {
    const { error } = await supabase.from("winner_reaction").insert({
      winner_post_id: args.winnerPostId,
      app_user_id: args.appUserId,
      reaction_type: args.reactionType,
    });
    if (error) throw new Error(`winner reaction insert failed: ${error.message}`);
  }

  const counts = await getWinnerReactionCounts([args.winnerPostId]);
  return { active, counts: counts.get(args.winnerPostId) ?? {} };
}

export interface ModeratedWinnerPost {
  id: string;
  app_user_id: string;
  listing_id: string;
  review_status: WinnerReviewStatus;
  verified_win: boolean;
}

export async function moderateWinnerPost(args: {
  winnerPostId: string;
  reviewerUserId: string;
  action: "publish" | "hide" | "reject";
  verifiedWin: boolean;
  reviewNotes?: string;
  verificationEvidenceUrl?: string;
}): Promise<ModeratedWinnerPost> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase.rpc("moderate_winner_post", {
    p_winner_post_id: args.winnerPostId,
    p_reviewer_user_id: args.reviewerUserId,
    p_action: args.action,
    p_verified_win: args.verifiedWin,
    p_review_notes: args.reviewNotes ?? null,
    p_verification_evidence_url: args.verificationEvidenceUrl ?? null,
  });
  if (error) throw new Error(`moderateWinnerPost failed: ${error.message}`);
  return data as ModeratedWinnerPost;
}
