import type { EntryFrequency, Listing } from "@/lib/types/listing";

// Badge computation and source-label text.
// Source of truth: "Sweepza — Trust, Verification & Badge Naming [CANONICAL]".

export type BadgeTone = "urgent" | "trust" | "entry" | "promo" | "proof" | "fresh";

export interface ComputedBadge {
  id: string;
  label: string;
  tone: BadgeTone;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const ENDS_SOON_DAYS = 3;
const NEW_DAYS = 7;

export function daysUntil(endDate: string, now: Date = new Date()): number {
  const end = new Date(endDate).getTime();
  return Math.ceil((end - now.getTime()) / DAY_MS);
}

export function isExpired(listing: Listing, now: Date = new Date()): boolean {
  if (listing.lifecycleStatus === "expired") return true;
  return daysUntil(listing.endDate, now) < 0;
}

const ENTRY_TYPE_LABELS: Partial<Record<EntryFrequency, string>> = {
  one_time: "One-Time",
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
  instant_win: "Instant Win",
};

/**
 * Computes the public badge set for a listing in the canonical card display
 * priority: Ends Today -> Ends Soon -> Verified -> Entry type ->
 * Featured / Boosted -> Winner Reported -> New. Callers should slice to the top
 * few for mobile cards; overflow belongs on the detail page.
 */
export function computeBadges(listing: Listing, now: Date = new Date()): ComputedBadge[] {
  const badges: ComputedBadge[] = [];
  const days = daysUntil(listing.endDate, now);

  // Urgency
  if (isExpired(listing, now)) {
    badges.push({ id: "expired", label: "Expired", tone: "urgent" });
  } else if (days <= 0) {
    badges.push({ id: "ends-today", label: "Ends Today", tone: "urgent" });
  } else if (days <= ENDS_SOON_DAYS) {
    badges.push({ id: "ends-soon", label: "Ends Soon", tone: "urgent" });
  }

  // Trust — both self_verified and admin_verified render as the single
  // public "Verified" badge (the distinction is internal only).
  if (
    listing.host &&
    (listing.host.verificationStatus === "self_verified" ||
      listing.host.verificationStatus === "admin_verified")
  ) {
    badges.push({ id: "verified", label: "Verified", tone: "trust" });
  }

  if (listing.listingVerificationStatus === "verified") {
    badges.push({ id: "verified-listing", label: "Verified Listing", tone: "trust" });
  }

  // Entry type
  const entryLabel = ENTRY_TYPE_LABELS[listing.entryFrequency];
  if (entryLabel) {
    badges.push({
      id: `entry-${listing.entryFrequency}`,
      label: entryLabel,
      tone: "entry",
    });
  }

  // Promotion
  if (listing.isFeatured) {
    badges.push({ id: "featured", label: "Featured", tone: "promo" });
  }
  if (listing.isBoosted) {
    badges.push({ id: "boosted", label: "Boosted", tone: "promo" });
  }

  // Community proof
  if (listing.winnerReported) {
    badges.push({ id: "winner-reported", label: "Winner Reported", tone: "proof" });
  }

  // Trust — official rules present
  if (listing.officialRulesUrl) {
    badges.push({ id: "official-rules", label: "Official Rules", tone: "trust" });
  }

  // Freshness
  if (listing.publishedAt) {
    const publishedDays = Math.ceil(
      (now.getTime() - new Date(listing.publishedAt).getTime()) / DAY_MS,
    );
    if (publishedDays >= 0 && publishedDays <= NEW_DAYS) {
      badges.push({ id: "new", label: "New", tone: "fresh" });
    }
  }

  return badges;
}

export const SOURCE_LABEL_TEXT: Record<Listing["sourceLabel"], string> = {
  found_by_sweepza: "Found by Sweepza",
  host_submitted: "Host Submitted",
  claimed_by_host: "Claimed by Host",
};
