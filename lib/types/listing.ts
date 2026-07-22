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

// Stored lifecycle states — canonical locked enum `lifecycle_status`.
// Source of truth: "Sweepza — Listing States & Quality Gate [CANONICAL]".
// Visibility and moderation are separate overlays, not lifecycle: the old
// `submitted`/`needs_review` collapse to `pending_review`, `suspended` =
// `paused` + moderation_status `action_taken`, and `hidden` lives on
// visibility_status. Mirrors lib/db/enums.ts LIFECYCLE_STATUSES.
export type LifecycleStatus =
  | "draft"
  | "pending_review"
  | "active"
  | "paused"
  | "expired"
  | "archived"
  | "rejected"
  | "held"
  | "inactive";

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

// Per-listing action timestamps as they appear in the seeker-state snapshot.
// Backed by listing_seeker_state columns; in local (signed-out) mode the client
// stamps these itself so Ready Again / Sweep Routine work without an account.
export interface SeekerListingActivity {
  savedAt?: string;
  enteredAt?: string;
  skippedAt?: string;
  wonAt?: string;
  updatedAt?: string;
}

export interface Listing {
  id: string;
  slug: string;
  title: string;
  shortDescription: string;
  longDescription?: string;

  // Prize
  prizeName: string;
  prizeValue?: number;
  prizeCurrency?: string;
  prizeCategory?: PrizeCategory;
  winnerCount?: number;

  // Media
  mainImageUrl?: string;
  imageSourceType?: "host_upload" | "owner_upload" | "photo_bucket" | "external_reference";
  imageAltText?: string;
  imageAttribution?: string;
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
  noPurchaseNecessary?: boolean;

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
