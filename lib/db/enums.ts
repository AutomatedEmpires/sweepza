// Mirrors the Postgres enums in supabase/migrations/20260604120000_enums.sql.
// Keep in lockstep with the DB; `pnpm db:types` can regenerate once a project exists.

export const LIFECYCLE_STATUSES = [
  "draft", "pending_review", "active", "paused", "expired", "archived", "rejected",
] as const;
export type LifecycleStatus = (typeof LIFECYCLE_STATUSES)[number];

export const VISIBILITY_STATUSES = ["public", "private", "hidden"] as const;
export type VisibilityStatus = (typeof VISIBILITY_STATUSES)[number];

export const MODERATION_STATUSES = ["clear", "flagged", "under_review", "action_taken"] as const;
export type ModerationStatus = (typeof MODERATION_STATUSES)[number];

export const DUPLICATE_STATUSES = ["clear", "suspected", "confirmed"] as const;
export type DuplicateStatus = (typeof DUPLICATE_STATUSES)[number];

export const LISTING_VERIFICATION_STATUSES = ["unreviewed", "reviewed", "verified", "rejected"] as const;
export type ListingVerificationStatus = (typeof LISTING_VERIFICATION_STATUSES)[number];

export const HOST_VERIFICATION_STATUSES = ["none", "self_verified", "admin_verified"] as const;
export type HostVerificationStatus = (typeof HOST_VERIFICATION_STATUSES)[number];

export const SOURCE_TYPES = ["owner_seeded", "host_submitted", "claimed_host"] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

export const SOURCE_LABELS = ["found_by_sweepza", "host_submitted", "claimed_by_host"] as const;
export type SourceLabel = (typeof SOURCE_LABELS)[number];

export const CREATED_BY_ROLES = ["owner", "host", "system"] as const;
export type CreatedByRole = (typeof CREATED_BY_ROLES)[number];

export const IMAGE_SOURCE_TYPES = ["host_upload", "owner_upload", "photo_bucket", "external_reference"] as const;
export type ImageSourceType = (typeof IMAGE_SOURCE_TYPES)[number];

export const ENTRY_FREQUENCIES = ["one_time", "daily", "weekly", "monthly", "instant_win", "other"] as const;
export type EntryFrequency = (typeof ENTRY_FREQUENCIES)[number];

export const SEEKER_UI_STATES = ["none", "saved", "entered", "skipped", "won"] as const;
export type SeekerUiState = (typeof SEEKER_UI_STATES)[number];

export const WINNER_REVIEW_STATUSES = ["draft", "submitted", "pending_review", "published", "hidden", "rejected"] as const;
export type WinnerReviewStatus = (typeof WINNER_REVIEW_STATUSES)[number];

export const REACTION_TYPES = ["congrats", "awesome", "nice_win", "celebration"] as const;
export type ReactionType = (typeof REACTION_TYPES)[number];

export const REPORT_TARGET_TYPES = ["listing", "host", "winner_post", "image", "entry_link"] as const;
export type ReportTargetType = (typeof REPORT_TARGET_TYPES)[number];

export const REPORT_REASONS = [
  "scam_suspicious", "broken_entry_link", "expired_listing", "duplicate_sweep",
  "misleading_prize", "inappropriate_image", "spam", "fake_winner_claim",
  "host_advertising_winner_wall", "rules_issue", "eligibility_issue", "other",
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export const REPORT_STATUSES = [
  "submitted", "ai_triage", "admin_review", "resolved", "dismissed", "escalated", "action_taken",
] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

export const REPORT_AI_SEVERITIES = ["low", "medium", "high", "critical"] as const;
export type ReportAiSeverity = (typeof REPORT_AI_SEVERITIES)[number];

export const CLAIM_STATUSES = ["unclaimed", "requested", "approved", "rejected"] as const;
export type ClaimStatus = (typeof CLAIM_STATUSES)[number];

export const SUBSCRIPTION_STATUSES = ["no_plan", "active", "grace", "past_due", "canceled"] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export const BOOST_TYPES = ["boost", "featured"] as const;
export type BoostType = (typeof BOOST_TYPES)[number];

export const BOOST_STATUSES = ["scheduled", "active", "ended", "canceled", "blocked"] as const;
export type BoostStatus = (typeof BOOST_STATUSES)[number];

export const NOTIFICATION_CHANNELS = ["in_app", "email"] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export const NOTIFICATION_STATUSES = ["queued", "sent", "delivered", "read", "suppressed", "failed", "skipped"] as const;
export type NotificationStatus = (typeof NOTIFICATION_STATUSES)[number];
