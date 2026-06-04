// Canonical listing object — card-relevant subset.
// Source of truth: "Sweepza — Canonical Listing Object" and
// "Sweepza — Listing Card Specification".
//
// Lane C renders this presentational shape from mock data. Lane B will back it
// with Supabase, and seeker-specific state will move to a join table (it is
// denormalized here only so a single mock card can demonstrate button states).

export type EntryFrequency =
  | "one_time"
  | "daily"
  | "weekly"
  | "monthly"
  | "instant_win"
  | "other";

export type SourceLabel =
  | "found_by_sweepza"
  | "host_submitted"
  | "claimed_by_host";

export type LifecycleStatus =
  | "draft"
  | "submitted"
  | "needs_review"
  | "active"
  | "expired"
  | "archived"
  | "rejected"
  | "hidden"
  | "suspended";

export type HostVerificationStatus =
  | "none"
  | "self_verified"
  | "admin_verified";

export type ListingVerificationStatus =
  | "unreviewed"
  | "reviewed"
  | "verified"
  | "rejected";

export type PrizeCategory =
  | "Cash"
  | "Gift Cards"
  | "Travel"
  | "Vehicles"
  | "Outdoor Gear"
  | "Electronics"
  | "Home Goods"
  | "Beauty/Fashion"
  | "Food/Beverage"
  | "Family/Kids"
  | "Seasonal/Holiday";

export type SeekerUiState =
  | "none"
  | "saved"
  | "entered"
  | "skipped"
  | "won";

export interface ListingHost {
  id: string;
  name: string;
  logoUrl?: string;
  verificationStatus: HostVerificationStatus;
}

export interface ListingSeekerState {
  primaryUiState: SeekerUiState;
  savedAt?: string;
  enteredAt?: string;
  skippedAt?: string;
  wonAt?: string;
}

export interface Listing {
  id: string;
  slug: string;
  title: string;
  shortDescription: string;

  // Prize
  prizeName: string;
  prizeValue?: number;
  prizeCurrency?: string;
  prizeCategory?: PrizeCategory;
  winnerCount?: number;

  // Media
  mainImageUrl?: string;
  imageAltText?: string;
  categoryFallbackImageUrl?: string;

  // Entry & rules
  entryUrl: string;
  officialRulesUrl?: string;
  startDate?: string;
  endDate: string; // ISO date — required
  entryFrequency: EntryFrequency;
  entryLimitNotes?: string;
  eligibilityCountry?: string;
  eligibilityStates?: string[];
  ageRequirement?: number;

  // Source & ownership
  sourceLabel: SourceLabel;
  originalSponsorName?: string;
  host?: ListingHost;

  // Status & trust
  lifecycleStatus: LifecycleStatus;
  listingVerificationStatus: ListingVerificationStatus;
  isFeatured?: boolean;
  isBoosted?: boolean;
  publishedAt?: string;
  winnerReported?: boolean;

  // Tags
  tags?: string[];

  // Seeker state (denormalized for the card only)
  seekerState?: ListingSeekerState;
}
