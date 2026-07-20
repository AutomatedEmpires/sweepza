-- =============================================================================
-- FOUNDER-GATED DRAFT — NOT A MIGRATION. DO NOT APPLY.
--
-- This file exists only so the reviewed DDL survives outside an ephemeral
-- session (it is the durable artifact behind
-- docs/runbooks/rls-policy-consolidation.md). It lives deliberately outside
-- supabase/migrations/ so no tooling can ever pick it up. Activation requires
-- explicit founder approval, then copying this DDL into a real timestamped
-- migration on a feat/data/* branch (see the runbook).
--
-- Rollback source of truth: the policies this draft replaces are defined in
-- supabase/migrations/20260604120600_rls.sql (and later policy migrations);
-- re-applying those definitions restores the exact prior state.
--
-- The UNINDEXED FOREIGN KEYS half of the original draft (11 covering indexes)
-- shipped separately as a real migration in PR #66 and is omitted here.
-- =============================================================================

-- Clear the Supabase performance-advisor findings (2026-07-16 snapshot):
--   * 72x multiple_permissive_policies [WARN]
--   * 11x unindexed_foreign_keys [INFO]
--
-- MULTIPLE PERMISSIVE POLICIES
-- ----------------------------
-- Postgres evaluates EVERY permissive policy that applies to a (role, action)
-- pair on EVERY row, so a `FOR ALL` write policy sitting next to a dedicated
-- `FOR SELECT` policy makes each read evaluate two predicates. The advisor
-- flags exactly seven such overlaps here (x roles x actions = 72 lints):
--
--   badge / category / eligibility / tag : X_write (ALL) + X_read (SELECT)
--   host                                 : host_write (ALL) + host_select, identical predicates
--   listing                              : owner_admin_write (ALL) overlaps host_* on all four actions
--   listing_seeker_state                 : seeker_state_owner (ALL) + seeker_state_admin_read (SELECT)
--   listing_tag                          : listing_tag_write (ALL) + listing_tag_select
--   winner_reaction                      : winner_reaction_write (ALL) + winner_reaction_select
--
-- The fix is mechanical and SEMANTICS-PRESERVING: replace each `FOR ALL`
-- policy with per-command policies whose predicates are the exact OR-union of
-- what the overlapping permissive policies granted for that command. Access
-- neither widens nor narrows; every (role, action) pair ends up with exactly
-- one permissive policy. Rationale per table is inline below.
--
-- UNINDEXED FOREIGN KEYS
-- ----------------------
-- Covering indexes for the 11 flagged FK columns. These make FK integrity
-- checks and the app's reverse lookups (reports by reporter, winner posts by
-- listing/user, tags by code) index scans instead of sequential scans.
--
-- NOT DONE HERE (deliberately):
--   * unused_index [INFO] on listing_end_date_idx / listing_category_idx /
--     listing_search_idx — "unused" only reflects the zero-traffic pre-launch
--     window; these back the feed sort, category filter, and full-text search.
--   * auth_db_connections_absolute [INFO] — dashboard configuration, not DDL.
--
-- Verified 2026-07-16 by dry-running this exact DDL against the live project
-- inside a rolled-back transaction: every statement applied cleanly, a post-
-- state assertion found zero (table, action) pairs with multiple permissive
-- policies and all 11 indexes present, then everything was rolled back.
-- (The CLI wraps this file in a transaction; no explicit begin/commit here,
-- matching the other migrations.)

-- ---------------------------------------------------------------------------
-- 1 · Dictionary tables: badge, category, eligibility, tag
--     Before: X_write FOR ALL (admin) + X_read FOR SELECT (true).
--     After:  X_read stays the sole SELECT policy (the ALL policy's admin read
--             was a strict subset of `true`); writes become one policy per
--             command with the identical admin predicate.
-- ---------------------------------------------------------------------------

drop policy "badge_write" on public.badge;
create policy "badge_admin_insert" on public.badge
  for insert with check (private.is_owner() or private.is_admin());
create policy "badge_admin_update" on public.badge
  for update using (private.is_owner() or private.is_admin())
  with check (private.is_owner() or private.is_admin());
create policy "badge_admin_delete" on public.badge
  for delete using (private.is_owner() or private.is_admin());

drop policy "category_write" on public.category;
create policy "category_admin_insert" on public.category
  for insert with check (private.is_owner() or private.is_admin());
create policy "category_admin_update" on public.category
  for update using (private.is_owner() or private.is_admin())
  with check (private.is_owner() or private.is_admin());
create policy "category_admin_delete" on public.category
  for delete using (private.is_owner() or private.is_admin());

drop policy "eligibility_write" on public.eligibility;
create policy "eligibility_admin_insert" on public.eligibility
  for insert with check (private.is_owner() or private.is_admin());
create policy "eligibility_admin_update" on public.eligibility
  for update using (private.is_owner() or private.is_admin())
  with check (private.is_owner() or private.is_admin());
create policy "eligibility_admin_delete" on public.eligibility
  for delete using (private.is_owner() or private.is_admin());

drop policy "tag_write" on public.tag;
create policy "tag_admin_insert" on public.tag
  for insert with check (private.is_owner() or private.is_admin());
create policy "tag_admin_update" on public.tag
  for update using (private.is_owner() or private.is_admin())
  with check (private.is_owner() or private.is_admin());
create policy "tag_admin_delete" on public.tag
  for delete using (private.is_owner() or private.is_admin());

-- ---------------------------------------------------------------------------
-- 2 · host: host_select duplicated host_write's predicate verbatim, so the ALL
--     policy alone already grants exactly the same SELECT access. Drop the
--     redundant SELECT policy; host_write remains the single policy per action.
-- ---------------------------------------------------------------------------

drop policy "host_select" on public.host;

-- ---------------------------------------------------------------------------
-- 3 · listing: owner_admin_write (ALL) overlapped every host_* policy AND the
--     public SELECT policy. listing_public_select already contains the
--     is_owner()/is_admin() branches, so it stays as the single SELECT policy;
--     insert/update/delete become the OR-union of the admin and host policies.
-- ---------------------------------------------------------------------------

drop policy "listing_owner_admin_write" on public.listing;
drop policy "listing_host_insert" on public.listing;
drop policy "listing_host_update" on public.listing;
drop policy "listing_host_delete" on public.listing;

create policy "listing_insert" on public.listing
  for insert with check (
    private.is_owner() or private.is_admin()
    or (
      private.is_host()
      and host_id = private.current_host_id()
      and source_type = 'host_submitted'::source_type
      and created_by_role = 'host'::created_by_role
    )
  );

create policy "listing_update" on public.listing
  for update using (
    private.is_owner() or private.is_admin()
    or (private.is_host() and host_id = private.current_host_id())
  )
  with check (
    private.is_owner() or private.is_admin()
    or (private.is_host() and host_id = private.current_host_id())
  );

create policy "listing_delete" on public.listing
  for delete using (
    private.is_owner() or private.is_admin()
    or (private.is_host() and host_id = private.current_host_id())
  );

-- ---------------------------------------------------------------------------
-- 4 · listing_seeker_state: the owner ALL policy overlapped the admin SELECT
--     policy. SELECT becomes the union (own row, or admin/owner oversight);
--     writes stay owner-only, one policy per command.
-- ---------------------------------------------------------------------------

drop policy "seeker_state_owner" on public.listing_seeker_state;
drop policy "seeker_state_admin_read" on public.listing_seeker_state;

create policy "seeker_state_select" on public.listing_seeker_state
  for select using (
    app_user_id = private.current_app_user_id()
    or private.is_admin() or private.is_owner()
  );
create policy "seeker_state_insert" on public.listing_seeker_state
  for insert with check (app_user_id = private.current_app_user_id());
create policy "seeker_state_update" on public.listing_seeker_state
  for update using (app_user_id = private.current_app_user_id())
  with check (app_user_id = private.current_app_user_id());
create policy "seeker_state_delete" on public.listing_seeker_state
  for delete using (app_user_id = private.current_app_user_id());

-- ---------------------------------------------------------------------------
-- 5 · listing_tag: the write ALL policy overlapped listing_tag_select, which
--     already covers the admin/owner and own-host read paths (the FK to
--     listing guarantees the EXISTS row is present). Writes split per command
--     with the identical admin-or-own-listing predicate.
-- ---------------------------------------------------------------------------

drop policy "listing_tag_write" on public.listing_tag;

create policy "listing_tag_insert" on public.listing_tag
  for insert with check (
    private.is_owner() or private.is_admin()
    or exists (
      select 1 from public.listing l
      where l.id = listing_tag.listing_id
        and l.host_id = private.current_host_id()
    )
  );
create policy "listing_tag_update" on public.listing_tag
  for update using (
    private.is_owner() or private.is_admin()
    or exists (
      select 1 from public.listing l
      where l.id = listing_tag.listing_id
        and l.host_id = private.current_host_id()
    )
  )
  with check (
    private.is_owner() or private.is_admin()
    or exists (
      select 1 from public.listing l
      where l.id = listing_tag.listing_id
        and l.host_id = private.current_host_id()
    )
  );
create policy "listing_tag_delete" on public.listing_tag
  for delete using (
    private.is_owner() or private.is_admin()
    or exists (
      select 1 from public.listing l
      where l.id = listing_tag.listing_id
        and l.host_id = private.current_host_id()
    )
  );

-- ---------------------------------------------------------------------------
-- 6 · winner_reaction: the own-row ALL policy overlapped the public SELECT.
--     Reads stay open; writes stay own-row-only, one policy per command.
-- ---------------------------------------------------------------------------

drop policy "winner_reaction_write" on public.winner_reaction;

create policy "winner_reaction_insert" on public.winner_reaction
  for insert with check (app_user_id = private.current_app_user_id());
create policy "winner_reaction_update" on public.winner_reaction
  for update using (app_user_id = private.current_app_user_id())
  with check (app_user_id = private.current_app_user_id());
create policy "winner_reaction_delete" on public.winner_reaction
  for delete using (app_user_id = private.current_app_user_id());
