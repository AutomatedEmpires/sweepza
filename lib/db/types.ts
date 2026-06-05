// Row types mirroring the Sweepza Supabase schema (supabase/migrations).
// Hand-authored to match the canonical data model; `pnpm db:types` can
// regenerate a full Database type once a real project exists.
import type {
  BoostStatus, BoostType, ClaimStatus, CreatedByRole, DuplicateStatus,
  EntryFrequency, HostVerificationStatus, ImageSourceType, LifecycleStatus,
  ListingVerificationStatus, ModerationStatus, NotificationChannel,
  NotificationStatus, ReactionType, ReportAiSeverity, ReportReason,
  ReportStatus, ReportTargetType, SeekerUiState, SourceLabel, SourceType,
  SubscriptionStatus, VisibilityStatus, WinnerReviewStatus,
} from "./enums";

// ISO-8601 strings as returned by PostgREST.
export type Timestamptz = string;
export type DateString = string;

export interface DictionaryRow {
  code: string;
  label: string;
  is_active: boolean;
  display_priority: number;
  created_at: Timestamptz;
}
export type CategoryRow = DictionaryRow;
export interface TagRow extends DictionaryRow {
  category_code: string | null;
}
export interface BadgeRow extends DictionaryRow {
  badge_group: string;
}
export type EligibilityRow = DictionaryRow;

export interface AppUserRow {
  id: string;
  clerk_user_id: string;
  email: string | null;
  display_name: string | null;
  cover_image_url: string | null;
  bio: string | null;
  is_owner: boolean;
  is_admin: boolean;
  is_host: boolean;
  is_seeker: boolean;
  created_at: Timestamptz;
  updated_at: Timestamptz;
}

export interface HostRow {
  id: string;
  app_user_id: string;
  display_name: string;
  logo_url: string | null;
  website_url: string | null;
  short_description: string | null;
  verification_status: HostVerificationStatus;
  stripe_customer_id: string | null;
  created_at: Timestamptz;
  updated_at: Timestamptz;
}

// Public-safe projection backing the `host_public` view (no stripe id / audit).
export type HostPublicRow = Pick<
  HostRow,
  "id" | "display_name" | "logo_url" | "website_url" | "short_description" | "verification_status"
>;

export interface ListingRow {
  id: string;
  slug: string;
  title: string;
  short_description: string;
  long_description: string | null;
  prize_name: string;
  prize_value: number | null;
  prize_currency: string | null;
  prize_category: string | null;
  winner_count: number | null;
  main_image_url: string | null;
  image_source_type: ImageSourceType | null;
  image_alt_text: string | null;
  category_fallback_image: string | null;
  entry_url: string | null;
  official_rules_url: string | null;
  official_rules_exception: boolean;
  start_date: DateString | null;
  end_date: DateString | null;
  entry_frequency: EntryFrequency | null;
  entry_limit_notes: string | null;
  eligibility_country: string | null;
  eligibility_states: string[] | null;
  age_requirement: number | null;
  no_purchase_necessary: boolean | null;
  source_type: SourceType;
  public_source_label: SourceLabel;
  created_by_role: CreatedByRole;
  created_by_user_id: string | null;
  host_id: string | null;
  sponsor_name: string | null;
  sponsor_url: string | null;
  sponsor_logo_url: string | null;
  sponsor_notes_internal: string | null;
  lifecycle_status: LifecycleStatus;
  visibility_status: VisibilityStatus;
  moderation_status: ModerationStatus;
  duplicate_status: DuplicateStatus;
  listing_verification_status: ListingVerificationStatus;
  is_featured: boolean;
  created_at: Timestamptz;
  updated_at: Timestamptz;
  published_at: Timestamptz | null;
}

export interface ListingTagRow {
  listing_id: string;
  tag_code: string;
}

export interface ListingSeekerStateRow {
  id: string;
  app_user_id: string;
  listing_id: string;
  viewed_at: Timestamptz | null;
  saved_at: Timestamptz | null;
  is_saved: boolean;
  entered_at: Timestamptz | null;
  skipped_at: Timestamptz | null;
  won_at: Timestamptz | null;
  primary_ui_state: SeekerUiState;
  created_at: Timestamptz;
  updated_at: Timestamptz;
}

export interface WinnerPostRow {
  id: string;
  app_user_id: string;
  listing_id: string | null;
  caption: string | null;
  photo_url: string | null;
  verified_win: boolean;
  review_status: WinnerReviewStatus;
  created_at: Timestamptz;
  updated_at: Timestamptz;
}

export interface WinnerReactionRow {
  id: string;
  winner_post_id: string;
  app_user_id: string;
  reaction_type: ReactionType;
  created_at: Timestamptz;
}

export interface ReportRow {
  id: string;
  reporter_user_id: string;
  target_type: ReportTargetType;
  target_id: string;
  reason_code: ReportReason;
  details: string | null;
  status: ReportStatus;
  ai_severity: ReportAiSeverity | null;
  assigned_admin_id: string | null;
  created_at: Timestamptz;
  resolved_at: Timestamptz | null;
}

export interface ListingClaimRow {
  id: string;
  listing_id: string;
  requesting_host_id: string;
  status: ClaimStatus;
  reviewed_by: string | null;
  requested_at: Timestamptz;
  reviewed_at: Timestamptz | null;
}

export interface SubscriptionRow {
  id: string;
  host_id: string;
  stripe_subscription_id: string | null;
  status: SubscriptionStatus;
  included_active_listings: number;
  purchased_additional_listings: number;
  max_active_listings: number;
  founding_host_number: number | null;
  founding_discount_percent: number | null;
  founding_discount_retained: boolean;
  created_at: Timestamptz;
  updated_at: Timestamptz;
}

export interface BoostRow {
  id: string;
  listing_id: string;
  host_id: string;
  type: BoostType;
  status: BoostStatus;
  starts_at: Timestamptz | null;
  ends_at: Timestamptz | null;
  stripe_payment_id: string | null;
  created_at: Timestamptz;
}

export interface NotificationPrefRow {
  app_user_id: string;
  ends_today: boolean;
  ends_soon: boolean;
  new_listings: boolean;
  saved_listing_ending: boolean;
  winner_wall_reactions: boolean;
  winner_wall_verification: boolean;
  weekly_roundup: boolean;
  featured_sweeps: boolean;
  email_enabled: boolean;
  in_app_enabled: boolean;
  push_enabled: boolean;
  updated_at: Timestamptz;
}

export interface NotificationLogRow {
  id: string;
  app_user_id: string;
  type: string;
  channel: NotificationChannel;
  status: NotificationStatus;
  sent_at: Timestamptz | null;
  created_at: Timestamptz;
}
