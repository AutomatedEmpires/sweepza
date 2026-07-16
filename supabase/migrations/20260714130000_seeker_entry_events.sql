-- Seeker entry-event log — the honest substrate for streaks and badges.
--
-- listing_seeker_state.entered_at only holds the *latest* entry per listing, so
-- it cannot reconstruct which days a seeker entered. This append-only log
-- records one row per (seeker, listing, day), letting the gamification engine
-- compute real distinct-day streaks and per-listing loyalty. Nothing here is
-- self-reported: rows are written server-side only when a genuine entry action
-- fires (lib/db/seeker-state.updateSeekerState).
create table seeker_entry_event (
  id uuid primary key default gen_random_uuid(),
  app_user_id uuid not null references app_user(id) on delete cascade,
  listing_id uuid not null references listing(id) on delete cascade,
  entered_on date not null default (now() at time zone 'utc')::date,
  created_at timestamptz not null default now(),
  -- One row per listing per day keeps re-entries idempotent (upsert do-nothing).
  unique (app_user_id, listing_id, entered_on)
);
create index seeker_entry_event_user_idx
  on seeker_entry_event (app_user_id, entered_on desc);

-- RLS mirrors listing_seeker_state: row-owner full access, admin read. Writes
-- and reads run through the service-role client, but the policies keep the
-- table safe if it is ever exposed under an RLS-authenticated client.
alter table seeker_entry_event enable row level security;
create policy seeker_entry_event_owner on seeker_entry_event for all
  using (app_user_id = private.current_app_user_id())
  with check (app_user_id = private.current_app_user_id());
create policy seeker_entry_event_admin_read on seeker_entry_event for select
  using (private.is_admin() or private.is_owner());
grant select, insert, update, delete on seeker_entry_event to authenticated;
