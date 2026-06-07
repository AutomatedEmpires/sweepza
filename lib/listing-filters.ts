import type { Listing } from "@/lib/types/listing";
import { daysUntil, isExpired } from "@/lib/listing-badges";

// Filters, sorting, and query helpers for Discover.
// Source of truth: "Sweepza — Search, Filters & Query Engine".
// AND across filter groups, OR within a group. Recommended sort is transparent
// and utility-driven (not pretend-personalized).

const DAY_MS = 24 * 60 * 60 * 1000;
const NEW_DAYS = 7;
const ENDS_SOON_DAYS = 3;

export type FilterChipId =
  | "new"
  | "ends_today"
  | "ends_soon"
  | "daily"
  | "instant_win"
  | "verified";

export type FilterGroup = "timing" | "entry" | "trust";

export interface FilterChip {
  id: FilterChipId;
  label: string;
  group: FilterGroup;
}

export const FILTER_CHIPS: FilterChip[] = [
  { id: "new", label: "New", group: "timing" },
  { id: "ends_today", label: "Ends Today", group: "timing" },
  { id: "ends_soon", label: "Ends Soon", group: "timing" },
  { id: "daily", label: "Daily", group: "entry" },
  { id: "instant_win", label: "Instant Win", group: "entry" },
  { id: "verified", label: "Verified", group: "trust" },
];

export type SortId = "recommended" | "newest" | "ending_soon";

export const SORT_OPTIONS: { id: SortId; label: string }[] = [
  { id: "recommended", label: "Recommended" },
  { id: "newest", label: "Newest" },
  { id: "ending_soon", label: "Ending soon" },
];

function publishedDaysAgo(listing: Listing, now: Date): number | null {
  if (!listing.publishedAt) return null;
  return Math.ceil((now.getTime() - new Date(listing.publishedAt).getTime()) / DAY_MS);
}

function isVerified(listing: Listing): boolean {
  return (
    listing.host?.verificationStatus === "self_verified" ||
    listing.host?.verificationStatus === "admin_verified" ||
    listing.listingVerificationStatus === "verified"
  );
}

function matchesChip(listing: Listing, chip: FilterChipId, now: Date): boolean {
  switch (chip) {
    case "new": {
      const d = publishedDaysAgo(listing, now);
      return d !== null && d >= 0 && d <= NEW_DAYS;
    }
    case "ends_today":
      return !isExpired(listing, now) && daysUntil(listing.endDate, now) <= 0;
    case "ends_soon": {
      const days = daysUntil(listing.endDate, now);
      return !isExpired(listing, now) && days > 0 && days <= ENDS_SOON_DAYS;
    }
    case "daily":
      return listing.entryFrequency === "daily";
    case "instant_win":
      return listing.entryFrequency === "instant_win";
    case "verified":
      return isVerified(listing);
    default:
      return false;
  }
}

export function filterListings(
  listings: Listing[],
  active: FilterChipId[],
  now: Date = new Date(),
): Listing[] {
  if (active.length === 0) return listings;

  const byGroup = new Map<FilterGroup, FilterChipId[]>();
  for (const chip of FILTER_CHIPS) {
    if (!active.includes(chip.id)) continue;
    const arr = byGroup.get(chip.group) ?? [];
    arr.push(chip.id);
    byGroup.set(chip.group, arr);
  }

  const groups = [...byGroup.values()];
  return listings.filter((listing) =>
    // AND across groups, OR within a group.
    groups.every((chips) => chips.some((chip) => matchesChip(listing, chip, now))),
  );
}

// Free-text search across card-relevant fields. All whitespace-separated terms
// must match (AND), case-insensitive substring. Empty query is a no-op.
export function searchListings(listings: Listing[], query: string): Listing[] {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return listings;

  const terms = trimmed.split(/\s+/);

  return listings.filter((listing) => {
    const haystack = [
      listing.title,
      listing.shortDescription,
      listing.prizeName,
      listing.prizeCategory,
      listing.originalSponsorName,
      listing.host?.name,
      ...(listing.tags ?? []),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return terms.every((term) => haystack.includes(term));
  });
}

function time(iso?: string): number {
  return iso ? new Date(iso).getTime() : 0;
}

// Transparent, utility-driven recommended score.
function recommendedScore(listing: Listing, now: Date): number {
  let score = 0;
  if (isExpired(listing, now)) score -= 1000;
  if (listing.isBoosted) score += 50;
  if (listing.isFeatured) score += 30;

  const days = daysUntil(listing.endDate, now);
  if (days >= 0 && days <= 1) score += 25;
  else if (days > 1 && days <= ENDS_SOON_DAYS) score += 15;

  if (isVerified(listing)) score += 10;

  const pd = publishedDaysAgo(listing, now);
  if (pd !== null && pd >= 0 && pd <= NEW_DAYS) score += 8;

  return score;
}

export function sortListings(
  listings: Listing[],
  sort: SortId,
  now: Date = new Date(),
): Listing[] {
  const copy = [...listings];
  switch (sort) {
    case "newest":
      return copy.sort((a, b) => time(b.publishedAt) - time(a.publishedAt));
    case "ending_soon":
      return copy.sort(
        (a, b) => new Date(a.endDate).getTime() - new Date(b.endDate).getTime(),
      );
    case "recommended":
    default:
      return copy.sort((a, b) => recommendedScore(b, now) - recommendedScore(a, now));
  }
}
