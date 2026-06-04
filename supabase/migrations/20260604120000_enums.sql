-- Sweepza canonical enums.
-- Source of truth: "Canonical Data Model & RLS [CANONICAL]" section 12,
-- reconciled with "Listing States & Quality Gate" and "Controlled Dictionaries".

create type lifecycle_status as enum (
  'draft', 'pending_review', 'active', 'paused', 'expired', 'archived', 'rejected'
);
create type visibility_status as enum ('public', 'private', 'hidden');
create type moderation_status as enum ('clear', 'flagged', 'under_review', 'action_taken');
create type duplicate_status as enum ('clear', 'suspected', 'confirmed');
create type listing_verification_status as enum ('unreviewed', 'reviewed', 'verified', 'rejected');
create type host_verification_status as enum ('none', 'self_verified', 'admin_verified');
create type source_type as enum ('owner_seeded', 'host_submitted', 'claimed_host');
create type source_label as enum ('found_by_sweepza', 'host_submitted', 'claimed_by_host');
create type created_by_role as enum ('owner', 'host', 'system');
create type image_source_type as enum ('host_upload', 'owner_upload', 'photo_bucket', 'external_reference');
create type entry_frequency as enum ('one_time', 'daily', 'weekly', 'monthly', 'instant_win', 'other');
create type seeker_ui_state as enum ('none', 'saved', 'entered', 'skipped', 'won');
create type winner_review_status as enum ('draft', 'submitted', 'pending_review', 'published', 'hidden', 'rejected');
create type reaction_type as enum ('congrats', 'awesome', 'nice_win', 'celebration');
create type report_target_type as enum ('listing', 'host', 'winner_post', 'image', 'entry_link');
create type report_reason as enum (
  'scam_suspicious', 'broken_entry_link', 'expired_listing', 'duplicate_sweep',
  'misleading_prize', 'inappropriate_image', 'spam', 'fake_winner_claim',
  'host_advertising_winner_wall', 'rules_issue', 'eligibility_issue', 'other'
);
create type report_status as enum (
  'submitted', 'ai_triage', 'admin_review', 'resolved', 'dismissed', 'escalated', 'action_taken'
);
create type report_ai_severity as enum ('low', 'medium', 'high', 'critical');
create type claim_status as enum ('unclaimed', 'requested', 'approved', 'rejected');
create type subscription_status as enum ('no_plan', 'active', 'grace', 'past_due', 'canceled');
create type boost_type as enum ('boost', 'featured');
create type boost_status as enum ('scheduled', 'active', 'ended', 'canceled', 'blocked');
create type notification_channel as enum ('in_app', 'email');
create type notification_status as enum ('queued', 'sent', 'delivered', 'read', 'suppressed', 'failed');
