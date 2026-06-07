-- Transactional email delivery support.
-- Adds per-event email opt-in flags on notification_pref, a JSON metadata
-- column on notification_log, and a 'skipped' status for prefs-suppressed sends.

-- Per-event email preferences (default on; new_reaction defaults off to match
-- the existing winner_wall_reactions opt-in posture is left to product, here on).
alter table notification_pref
  add column if not exists email_on_listing_approved boolean not null default true,
  add column if not exists email_on_listing_held boolean not null default true,
  add column if not exists email_on_listing_expiring_soon boolean not null default true,
  add column if not exists email_on_new_reaction boolean not null default true;

-- Structured payload captured for each notification_log entry.
alter table notification_log
  add column if not exists metadata jsonb not null default '{}'::jsonb;

-- Allow logging a prefs-suppressed (skipped) delivery attempt.
alter type notification_status add value if not exists 'skipped';
