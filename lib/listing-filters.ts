import type { Listing } from "@/lib/types/listing";
import { daysUntil, isExpired, listingExpiration } from "@/lib/listing-badges";
import { countryIncludesUnitedStates } from "@/lib/eligibility-country";

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
  | "one_time"
  | "daily"
  | "weekly"
  | "instant_win"
  | "value_100_plus"
  | "value_1000_plus"
  | "us_eligible"
  | "rules_linked"
  | "verified";

export type FilterGroup =
  | "timing"
  | "entry"
  | "value"
  | "eligibility"
  | "trust";

export interface FilterChip {
  id: FilterChipId;
  label: string;
  group: FilterGroup;
}

export const FILTER_CHIPS: FilterChip[] = [
  { id: "new", label: "New", group: "timing" },
  { id: "ends_today", label: "Ends Today", group: "timing" },
  { id: "ends_soon", label: "Ends Soon", group: "timing" },
  { id: "one_time", label: "One time", group: "entry" },
  { id: "daily", label: "Daily", group: "entry" },
  { id: "weekly", label: "Weekly", group: "entry" },
  { id: "instant_win", label: "Instant Win", group: "entry" },
  { id: "value_100_plus", label: "$100+", group: "value" },
  { id: "value_1000_plus", label: "$1,000+", group: "value" },
  { id: "us_eligible", label: "US eligible", group: "eligibility" },
  { id: "rules_linked", label: "Rules linked", group: "trust" },
  { id: "verified", label: "Verified", group: "trust" },
];

const FILTER_CHIP_IDS = new Set<FilterChipId>(
  FILTER_CHIPS.map((chip) => chip.id),
);

export type SortId =
  | "recommended"
  | "newest"
  | "ending_soon"
  | "highest_value";

export const SORT_OPTIONS: { id: SortId; label: string }[] = [
  { id: "recommended", label: "Recommended" },
  { id: "newest", label: "Newest" },
  { id: "ending_soon", label: "Ending soon" },
  { id: "highest_value", label: "Highest stated value" },
];

const SORT_IDS = new Set<SortId>(SORT_OPTIONS.map((option) => option.id));

export function parseFilterIds(value?: string | string[]): FilterChipId[] {
  const serialized = Array.isArray(value) ? value.join(",") : value ?? "";
  return [
    ...new Set(
      serialized
        .split(",")
        .map((item) => item.trim())
        .filter((item): item is FilterChipId =>
          FILTER_CHIP_IDS.has(item as FilterChipId),
        ),
    ),
  ];
}

export function parseSortId(value?: string | string[]): SortId {
  const candidate = Array.isArray(value) ? value[0] : value;
  return SORT_IDS.has(candidate as SortId)
    ? (candidate as SortId)
    : "recommended";
}

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

function matchesChip(
  listing: Listing,
  chip: FilterChipId,
  now: Date,
  calendarTimeZone?: string,
): boolean {
  switch (chip) {
    case "new": {
      const d = publishedDaysAgo(listing, now);
      return d !== null && d >= 0 && d <= NEW_DAYS;
    }
    case "ends_today":
      return listingExpiration(listing.endDate, now, calendarTimeZone).state === "ends_today";
    case "ends_soon": {
      const days = daysUntil(listing.endDate, now);
      return !isExpired(listing, now) && days > 0 && days <= ENDS_SOON_DAYS;
    }
    case "daily":
      return listing.entryFrequency === "daily";
    case "one_time":
      return listing.entryFrequency === "one_time";
    case "weekly":
      return listing.entryFrequency === "weekly";
    case "instant_win":
      return listing.entryFrequency === "instant_win";
    case "value_100_plus":
      return typeof listing.prizeValue === "number" && listing.prizeValue >= 100;
    case "value_1000_plus":
      return typeof listing.prizeValue === "number" && listing.prizeValue >= 1000;
    case "us_eligible":
      return listing.eligibilityCountry
        ? countryIncludesUnitedStates(listing.eligibilityCountry)
        : false;
    case "rules_linked":
      return Boolean(listing.officialRulesUrl);
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
  calendarTimeZone?: string,
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
    groups.every((chips) =>
      chips.some((chip) => matchesChip(listing, chip, now, calendarTimeZone)),
    ),
  );
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
    case "highest_value":
      return copy.sort(
        (a, b) => (b.prizeValue ?? -1) - (a.prizeValue ?? -1),
      );
    case "recommended":
    default:
      return copy.sort((a, b) => recommendedScore(b, now) - recommendedScore(a, now));
  }
}
