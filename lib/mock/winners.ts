import type { ReactionType, WinnerReviewStatus } from "@/lib/db/enums";

// UI-facing winner post shape. Flattens WinnerPostRow + aggregated
// WinnerReactionRow counts from the canonical data model (lib/db/types.ts)
// for the read-only Winner Wall. `listingSlug` joins to MOCK_LISTINGS so the
// attached-listing preview reuses the same data as Discover and the detail page.
// Comments are intentionally omitted in MVP per the Screen Inventory spec.
export interface WinnerPost {
  id: string;
  winnerDisplayName: string;
  caption: string;
  /** Winner's own photo. Falls back to the attached listing image in the UI. */
  photoUrl?: string;
  /** Joins to a MOCK_LISTINGS slug for the attached-listing preview. */
  listingSlug: string;
  /** True once Sweepza has verified the win (drives the trust pill). */
  verifiedWin: boolean;
  reviewStatus: WinnerReviewStatus;
  /** Aggregated positive reactions by type. */
  reactions: Partial<Record<ReactionType, number>>;
  createdAt: string; // ISO-8601
}

export const MOCK_WINNERS: WinnerPost[] = [
  {
    id: "winner-free-groceries",
    winnerDisplayName: "Marisol R.",
    caption:
      "Still can't believe it — a full year of groceries covered! I entered every day on my coffee break and it finally paid off. Thank you Sweepza for keeping the entry link alive and reminding me before it closed.",
    listingSlug: "free-groceries-for-a-year",
    verifiedWin: true,
    reviewStatus: "published",
    reactions: { congrats: 42, celebration: 19, nice_win: 11 },
    createdAt: "2026-05-22T15:10:00.000Z",
  },
  {
    id: "winner-paddle-board",
    winnerDisplayName: "Devin K.",
    caption:
      "Took the paddle board out for its first trip this weekend. Found this one on Sweepza and the rules were laid out so clearly I knew exactly how to enter. Lake season is going to be unreal.",
    listingSlug: "win-a-paddle-board",
    verifiedWin: true,
    reviewStatus: "published",
    reactions: { awesome: 27, congrats: 15, celebration: 6 },
    createdAt: "2026-05-18T19:42:00.000Z",
  },
  {
    id: "winner-gaming-rig",
    winnerDisplayName: "Priya S.",
    caption:
      "Instant-win actually hit for me?! The new rig is already set up and running. I saved this listing, entered once, and got the winning screen on the spot.",
    listingSlug: "instant-win-gaming-rig",
    verifiedWin: false,
    reviewStatus: "published",
    reactions: { celebration: 33, awesome: 21, congrats: 14, nice_win: 5 },
    createdAt: "2026-05-12T03:05:00.000Z",
  },
  {
    id: "winner-amazon-gift-card",
    winnerDisplayName: "Theo M.",
    caption:
      "$500 gift card landed in my inbox this morning. Quick, legit, and the official rules link made me comfortable entering. Already eyeing my next sweep.",
    listingSlug: "win-500-amazon-gift-card",
    verifiedWin: true,
    reviewStatus: "published",
    reactions: { congrats: 22, nice_win: 9 },
    createdAt: "2026-05-04T17:25:00.000Z",
  },
];
