-- Seeker reminder engine support.
-- notification_pref already carries ends_today / ends_soon / saved_listing_ending
-- / new_listings / weekly_roundup and the channel toggles. The only reminder
-- class without a home is "ready again" (a recurring entry window re-opened),
-- so add its per-event opt-in. Default on, matching the other seeker reminders.
alter table notification_pref
  add column if not exists ready_again boolean not null default true;
