import { daysUntil, isExpired } from "@/lib/listing-badges";
import { isReadyAgain } from "@/lib/sweep-routine";
import type { Listing, SeekerListingActivity, SeekerUiState } from "@/lib/types/listing";

// The single most-important "context" a card should communicate right now.
// Priority: personal outcome/state > urgency > freshness > cadence > promotion
// > category. One label per card — never a wall of badges.
export type ContextTone =
  | "won" // gold
  | "urgent" // flame — ends today/tonight
  | "soon" // ember — ending within days
  | "again" // pine — a re-entry window is open
  | "entered" // neutral-positive
  | "new" // ocean
  | "daily" // pine-tint
  | "featured" // ink
  | "category" // neutral
  | "expired"; // muted

export interface ListingContext {
  label: string;
  tone: ContextTone;
}

const ENDS_SOON_DAYS = 3;

export function pickListingContext(
  listing: Listing,
  seeker: {
    uiState?: SeekerUiState;
    saved?: boolean;
    activity?: SeekerListingActivity;
  } = {},
  now: Date = new Date(),
): ListingContext {
  const { uiState, activity } = seeker;
  const days = daysUntil(listing.endDate, now);
  const expired = isExpired(listing, now);

  // 1. Personal outcome — permanent.
  if (uiState === "won") return { label: "Won", tone: "won" };

  // 2. Re-entry window open (personal + cadence).
  if (isReadyAgain(listing, activity, now)) {
    return { label: "Ready again", tone: "again" };
  }

  // 3. Expired (honest).
  if (expired) return { label: "Ended", tone: "expired" };

  // 4. Urgency outranks category.
  if (days <= 0) return { label: "Ends today", tone: "urgent" };
  if (days === 1) return { label: "Ends tomorrow", tone: "soon" };
  if (days <= ENDS_SOON_DAYS) return { label: `${days} days left`, tone: "soon" };

  // 5. In-play state.
  if (uiState === "entered") return { label: "Entered", tone: "entered" };

  // 6. Freshness.
  if (listing.publishedAt) {
    const sinceDays = Math.floor(
      (now.getTime() - new Date(listing.publishedAt).getTime()) /
        (24 * 60 * 60 * 1000),
    );
    if (sinceDays >= 0 && sinceDays <= 7) return { label: "New", tone: "new" };
  }

  // 7. Cadence.
  if (listing.entryFrequency === "daily") return { label: "Daily entry", tone: "daily" };
  if (listing.entryFrequency === "instant_win")
    return { label: "Instant win", tone: "daily" };

  // 8. Promotion.
  if (listing.isFeatured || listing.isBoosted)
    return { label: "Featured", tone: "featured" };

  // 9. Category fallback.
  if (listing.prizeCategory) return { label: listing.prizeCategory, tone: "category" };
  return { label: "Open", tone: "category" };
}
