import "server-only";

import type { WinnerPost } from "@/lib/mock/winners";
import type { Listing } from "@/lib/types/listing";
import { createServiceRoleClient, createServerSupabaseClient } from "@/lib/supabase/server";
import { toWinnerPost } from "./adapters";
import { getPublicListingsByIds } from "./listings";
import type { ReactionType } from "./enums";
import type {
  AppUserRow,
  WinnerPostRow,
  WinnerReactionRow,
} from "./types";

export interface WinnerWallItem {
  post: WinnerPost;
  listing?: Listing;
}

export async function getPublishedWinnerWall(
  limit = 20,
): Promise<WinnerWallItem[]> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("winner_post")
    .select("*")
    .eq("review_status", "published")
    .order("created_at", { ascending: false })
    .limit(limit)
    .returns<WinnerPostRow[]>();

  if (error) {
    throw new Error(`getPublishedWinnerWall failed: ${error.message}`);
  }

  const rows = data ?? [];
  if (rows.length === 0) return [];

  const winnerUserIds = [...new Set(rows.map((row) => row.app_user_id))];
  const listingIds = [...new Set(rows.flatMap((row) => (row.listing_id ? [row.listing_id] : [])))];
  const postIds = rows.map((row) => row.id);

  const serviceRole = createServiceRoleClient();

  const [usersResult, listingsResult, reactionsResult] = await Promise.all([
    serviceRole
      .from("app_user")
      .select("id, display_name")
      .in("id", winnerUserIds)
      .returns<Pick<AppUserRow, "id" | "display_name">[]>(),
    getPublicListingsByIds(listingIds),
    serviceRole
      .from("winner_reaction")
      .select("*")
      .in("winner_post_id", postIds)
      .returns<WinnerReactionRow[]>(),
  ]);

  if (usersResult.error) {
    throw new Error(`getPublishedWinnerWall user lookup failed: ${usersResult.error.message}`);
  }
  if (reactionsResult.error) {
    throw new Error(`getPublishedWinnerWall reaction lookup failed: ${reactionsResult.error.message}`);
  }

  const usersById = new Map(
    (usersResult.data ?? []).map((user) => [user.id, user.display_name]),
  );
  const listingsById = new Map(
    listingsResult.map((listing) => [listing.id, listing]),
  );
  const reactionsByWinnerPostId = new Map<string, WinnerReactionRow[]>();

  for (const reaction of reactionsResult.data ?? []) {
    const bucket = reactionsByWinnerPostId.get(reaction.winner_post_id);
    if (bucket) {
      bucket.push(reaction);
    } else {
      reactionsByWinnerPostId.set(reaction.winner_post_id, [reaction]);
    }
  }

  return rows.map((row) => {
    const listing = row.listing_id ? listingsById.get(row.listing_id) : undefined;
    const listingSlug = listing?.slug ?? "";
    const winnerDisplayName = usersById.get(row.app_user_id) ?? "Sweepza Member";

    return {
      post: toWinnerPost(row, {
        winnerDisplayName,
        listingSlug,
        reactions: reactionsByWinnerPostId.get(row.id) ?? [],
      }),
      listing,
    };
  });
}

function countReactions(
  rows: WinnerReactionRow[],
): Partial<Record<ReactionType, number>> {
  const counts: Partial<Record<ReactionType, number>> = {};
  for (const row of rows) {
    counts[row.reaction_type] = (counts[row.reaction_type] ?? 0) + 1;
  }
  return counts;
}

export async function toggleWinnerReaction(args: {
  winnerPostId: string;
  appUserId: string;
  reactionType: ReactionType;
}): Promise<Partial<Record<ReactionType, number>>> {
  const { winnerPostId, appUserId, reactionType } = args;
  const supabase = createServiceRoleClient();

  const { data: existing, error: existingError } = await supabase
    .from("winner_reaction")
    .select("id")
    .eq("winner_post_id", winnerPostId)
    .eq("app_user_id", appUserId)
    .eq("reaction_type", reactionType)
    .maybeSingle<{ id: string }>();

  if (existingError) {
    throw new Error(`toggleWinnerReaction read failed: ${existingError.message}`);
  }

  if (existing?.id) {
    const { error } = await supabase
      .from("winner_reaction")
      .delete()
      .eq("id", existing.id);

    if (error) {
      throw new Error(`toggleWinnerReaction delete failed: ${error.message}`);
    }
  } else {
    const { error } = await supabase
      .from("winner_reaction")
      .insert({
        winner_post_id: winnerPostId,
        app_user_id: appUserId,
        reaction_type: reactionType,
      });

    if (error) {
      throw new Error(`toggleWinnerReaction insert failed: ${error.message}`);
    }
  }

  const { data, error } = await supabase
    .from("winner_reaction")
    .select("*")
    .eq("winner_post_id", winnerPostId)
    .returns<WinnerReactionRow[]>();

  if (error) {
    throw new Error(`toggleWinnerReaction recount failed: ${error.message}`);
  }

  return countReactions(data ?? []);
}
