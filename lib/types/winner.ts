import type { ReactionType, WinnerReviewStatus } from "@/lib/db/enums";

export interface WinnerPost {
  id: string;
  winnerDisplayName: string;
  winnerAvatarUrl?: string;
  caption: string;
  photoUrl?: string;
  listingSlug: string;
  listingTitle?: string;
  listingPrizeValue?: number | null;
  verifiedWin: boolean;
  reviewStatus: WinnerReviewStatus;
  reactions: Partial<Record<ReactionType, number>>;
  createdAt: string; // ISO-8601
}

export type WinnerReactionCounts = Partial<Record<ReactionType, number>>;
