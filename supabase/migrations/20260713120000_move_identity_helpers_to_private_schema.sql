-- Move the SECURITY DEFINER identity helpers out of the PostgREST-exposed
-- `public` schema into a non-exposed `private` schema.
--
-- Clears the 12 Supabase security-advisor WARN findings (6 helpers x {anon,
-- authenticated}) that flag these functions as callable via the Data API RPC
-- endpoint:
--   current_clerk_user_id(), current_app_user_id(), current_host_id(),
--   is_owner(), is_admin(), is_host().
--
-- WHY NOT `revoke execute ... from anon, authenticated`:
--   Every RLS policy predicate -- and the two trigger functions below -- calls
--   these helpers, so the querying roles MUST retain EXECUTE. Revoking it would
--   break RLS entirely. The correct fix is to relocate the functions to a schema
--   PostgREST does not expose. API exposure is governed by PostgREST's
--   `db-schemas` list (public, graphql_public) -- NOT by grants -- so a schema
--   named `private` is unreachable over REST regardless of who holds EXECUTE.
--   USAGE/EXECUTE grants therefore keep policy evaluation working WITHOUT
--   re-exposing anything.
--
-- ORDERING (this whole file is one transaction):
--   1. Create `private`; grant USAGE to the roles that evaluate policies.
--   2. Recreate the six helpers in `private` (identical behavior; search_path
--      pinned; inter-helper calls schema-qualified so they resolve independent
--      of search_path).
--   3. Repoint every dependent: all RLS policies (public tables + storage), and
--      the two trigger functions whose bodies call the helpers. Policies hold a
--      hard catalog dependency on the function, so they must be repointed before
--      the public copies can be dropped.
--   4. Drop the six public helpers (no CASCADE -- a missed dependency should
--      abort this migration loudly, never silently drop a policy).
--
-- Non-destructive to data: only stateless functions move and policy predicates
-- are rewritten to equivalent expressions. Forward-only, additive-then-swap.

-- 1. Non-exposed schema ------------------------------------------------------
create schema if not exists private;

-- USAGE lets these roles reference objects in `private` (required to execute a
-- function that lives there). This does NOT expose the schema over the API.
grant usage on schema private to anon, authenticated, service_role;

-- 2. Recreate the identity helpers in `private` -----------------------------
-- Bodies are unchanged except that inter-helper calls are schema-qualified
-- (private.current_clerk_user_id()) so they resolve without relying on the
-- search_path. search_path stays pinned to `public` so unqualified table refs
-- (app_user, host) resolve exactly as before; auth.jwt() is already qualified.
create or replace function private.current_clerk_user_id() returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select nullif(coalesce(auth.jwt() ->> 'sub', ''), '');
$$;

create or replace function private.current_app_user_id() returns uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select id from app_user where clerk_user_id = private.current_clerk_user_id();
$$;

create or replace function private.is_owner() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select is_owner from app_user where clerk_user_id = private.current_clerk_user_id()), false);
$$;

create or replace function private.is_admin() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select is_admin from app_user where clerk_user_id = private.current_clerk_user_id()), false);
$$;

create or replace function private.is_host() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select is_host from app_user where clerk_user_id = private.current_clerk_user_id()), false);
$$;

create or replace function private.current_host_id() returns uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select h.id from host h
  join app_user u on u.id = h.app_user_id
  where u.clerk_user_id = private.current_clerk_user_id()
  limit 1;
$$;

-- Least privilege: drop the default PUBLIC grant, then grant EXECUTE only to the
-- roles that evaluate RLS (anon, authenticated) and run triggers under a bypass
-- context (service_role). This is what keeps RLS working after the move.
revoke execute on function
  private.current_clerk_user_id(),
  private.current_app_user_id(),
  private.is_owner(),
  private.is_admin(),
  private.is_host(),
  private.current_host_id()
from public;

grant execute on function
  private.current_clerk_user_id(),
  private.current_app_user_id(),
  private.is_owner(),
  private.is_admin(),
  private.is_host(),
  private.current_host_id()
to anon, authenticated, service_role;

-- 3a. Repoint RLS policies on public tables to private.* ---------------------
-- ALTER POLICY rewrites only the predicate(s); the FOR/TO/AS clauses are
-- preserved, and the policy is never absent (no gap for concurrent sessions).

-- Dictionaries (owner/admin writable)
alter policy category_write on category
  using (private.is_owner() or private.is_admin())
  with check (private.is_owner() or private.is_admin());
alter policy tag_write on tag
  using (private.is_owner() or private.is_admin())
  with check (private.is_owner() or private.is_admin());
alter policy badge_write on badge
  using (private.is_owner() or private.is_admin())
  with check (private.is_owner() or private.is_admin());
alter policy eligibility_write on eligibility
  using (private.is_owner() or private.is_admin())
  with check (private.is_owner() or private.is_admin());

-- app_user
alter policy app_user_select on app_user
  using (clerk_user_id = private.current_clerk_user_id() or private.is_owner() or private.is_admin());
alter policy app_user_insert on app_user
  with check (clerk_user_id = private.current_clerk_user_id() or private.is_owner() or private.is_admin());
alter policy app_user_update on app_user
  using (clerk_user_id = private.current_clerk_user_id() or private.is_owner() or private.is_admin())
  with check (clerk_user_id = private.current_clerk_user_id() or private.is_owner() or private.is_admin());

-- host
alter policy host_select on host
  using (app_user_id = private.current_app_user_id() or private.is_owner() or private.is_admin());
alter policy host_write on host
  using (app_user_id = private.current_app_user_id() or private.is_owner() or private.is_admin())
  with check (app_user_id = private.current_app_user_id() or private.is_owner() or private.is_admin());

-- listing
alter policy listing_public_select on listing using (
  (visibility_status = 'public' and lifecycle_status = 'active'
    and moderation_status not in ('under_review', 'action_taken'))
  or private.is_owner() or private.is_admin()
  or (host_id is not null and host_id = private.current_host_id())
);
alter policy listing_owner_admin_write on listing
  using (private.is_owner() or private.is_admin())
  with check (private.is_owner() or private.is_admin());
alter policy listing_host_insert on listing
  with check (private.is_host() and host_id = private.current_host_id()
    and source_type = 'host_submitted' and created_by_role = 'host');
alter policy listing_host_update on listing
  using (private.is_host() and host_id = private.current_host_id())
  with check (private.is_host() and host_id = private.current_host_id());
alter policy listing_host_delete on listing
  using (private.is_host() and host_id = private.current_host_id());

-- listing_tag (follows the parent listing)
alter policy listing_tag_select on listing_tag using (
  exists (select 1 from listing l where l.id = listing_id and (
    (l.visibility_status = 'public' and l.lifecycle_status = 'active'
      and l.moderation_status not in ('under_review','action_taken'))
    or private.is_owner() or private.is_admin() or l.host_id = private.current_host_id()))
);
alter policy listing_tag_write on listing_tag using (
  private.is_owner() or private.is_admin()
  or exists (select 1 from listing l where l.id = listing_id and l.host_id = private.current_host_id())
) with check (
  private.is_owner() or private.is_admin()
  or exists (select 1 from listing l where l.id = listing_id and l.host_id = private.current_host_id())
);

-- listing_seeker_state
alter policy seeker_state_owner on listing_seeker_state
  using (app_user_id = private.current_app_user_id())
  with check (app_user_id = private.current_app_user_id());
alter policy seeker_state_admin_read on listing_seeker_state
  using (private.is_admin() or private.is_owner());

-- winner_post
alter policy winner_post_select on winner_post using (
  review_status = 'published' or app_user_id = private.current_app_user_id() or private.is_admin() or private.is_owner()
);
alter policy winner_post_insert on winner_post
  with check (app_user_id = private.current_app_user_id());
alter policy winner_post_update on winner_post
  using (app_user_id = private.current_app_user_id() or private.is_admin() or private.is_owner())
  with check (app_user_id = private.current_app_user_id() or private.is_admin() or private.is_owner());
alter policy winner_post_delete on winner_post
  using (private.is_admin() or private.is_owner());

-- winner_reaction
alter policy winner_reaction_write on winner_reaction
  using (app_user_id = private.current_app_user_id())
  with check (app_user_id = private.current_app_user_id());

-- report
alter policy report_insert on report
  with check (reporter_user_id = private.current_app_user_id());
alter policy report_select on report
  using (reporter_user_id = private.current_app_user_id() or private.is_admin() or private.is_owner());
alter policy report_update on report
  using (private.is_admin()) with check (private.is_admin());

-- listing_claim
alter policy listing_claim_insert on listing_claim
  with check (requesting_host_id = private.current_host_id());
alter policy listing_claim_select on listing_claim
  using (requesting_host_id = private.current_host_id() or private.is_admin() or private.is_owner());
alter policy listing_claim_update on listing_claim
  using (private.is_admin() or private.is_owner()) with check (private.is_admin() or private.is_owner());

-- subscription & boost
alter policy subscription_owner on subscription
  using (host_id = private.current_host_id() or private.is_admin() or private.is_owner())
  with check (host_id = private.current_host_id() or private.is_admin() or private.is_owner());
alter policy boost_owner on boost
  using (host_id = private.current_host_id() or private.is_admin() or private.is_owner())
  with check (host_id = private.current_host_id() or private.is_admin() or private.is_owner());

-- notifications
alter policy notification_pref_owner on notification_pref
  using (app_user_id = private.current_app_user_id() or private.is_admin() or private.is_owner())
  with check (app_user_id = private.current_app_user_id() or private.is_admin() or private.is_owner());
alter policy notification_log_owner on notification_log
  using (app_user_id = private.current_app_user_id() or private.is_admin() or private.is_owner());

-- 3b. Repoint storage.objects policies to private.* --------------------------
alter policy host_logo_write_own on storage.objects
  with check (
    bucket_id = 'host-logos'
    and split_part(name, '/', 1) = private.current_host_id()::text
  );
alter policy host_logo_update_own on storage.objects
  using (
    bucket_id = 'host-logos'
    and split_part(name, '/', 1) = private.current_host_id()::text
  );

-- 3c. Repoint the two trigger functions that call the helpers ----------------
-- create or replace preserves each function's existing ACL, so the trigger-only
-- revoke from 20260713000551 on protect_listing_privileged_fields stays in
-- effect. search_path/security qualifiers are restated so create-or-replace
-- does not reset them.

-- protect_listing_privileged_fields: latest definition (host experience lane),
-- with the single helper call now schema-qualified.
create or replace function protect_listing_privileged_fields()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Service-role / system writes (no Clerk identity) bypass these guards.
  if private.current_clerk_user_id() is null then
    return new;
  end if;

  -- Privileged columns can never be changed by host-context writes.
  if new.moderation_status is distinct from old.moderation_status then
    -- Allow only the narrow host-driven moderation transitions.
    if not (
      (old.moderation_status in ('draft', 'clear') and new.moderation_status = 'submitted')
      or (old.moderation_status = 'held' and new.moderation_status = 'draft')
    ) then
      raise exception 'moderation_status transition % -> % not allowed for host', old.moderation_status, new.moderation_status;
    end if;
  end if;

  if new.listing_verification_status is distinct from old.listing_verification_status then
    raise exception 'listing_verification_status cannot be modified by host';
  end if;

  if new.is_featured is distinct from old.is_featured then
    raise exception 'is_featured cannot be modified by host';
  end if;

  if new.public_source_label is distinct from old.public_source_label then
    raise exception 'public_source_label cannot be modified by host';
  end if;

  if new.review_notes_internal is distinct from old.review_notes_internal then
    raise exception 'review_notes_internal cannot be modified by host';
  end if;

  -- Guard lifecycle_status transitions for host writers.
  if new.lifecycle_status is distinct from old.lifecycle_status then
    if not (
      (old.lifecycle_status = 'draft' and new.lifecycle_status = 'pending_review')
      or (old.lifecycle_status = 'active' and new.lifecycle_status = 'inactive')
      or (old.lifecycle_status = 'held' and new.lifecycle_status = 'draft')
    ) then
      raise exception 'lifecycle_status transition % -> % not allowed for host', old.lifecycle_status, new.lifecycle_status;
    end if;
  end if;

  return new;
end;
$$;

-- protect_app_user_roles: unchanged behavior, helper calls schema-qualified.
-- (SECURITY INVOKER, as originally defined; search_path restated so the
-- 20260607000000 hardening is not lost on replace.)
create or replace function protect_app_user_roles() returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if private.current_clerk_user_id() is null or private.is_owner() or private.is_admin() then
    return new;
  end if;
  if new.is_owner is distinct from old.is_owner
    or new.is_admin is distinct from old.is_admin
    or new.is_host is distinct from old.is_host then
    raise exception 'not permitted: role flags are managed by admins';
  end if;
  return new;
end;
$$;

-- 4. Drop the public helpers -------------------------------------------------
-- No CASCADE: if any dependency was missed above, these drops fail and abort the
-- migration rather than silently removing a policy.
drop function public.current_app_user_id();
drop function public.current_host_id();
drop function public.is_owner();
drop function public.is_admin();
drop function public.is_host();
drop function public.current_clerk_user_id();
