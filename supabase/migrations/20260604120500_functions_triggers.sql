-- Functions & triggers: updated_at, identity helpers, quality gate, entitlement
-- cap, privileged-field protection, role protection, claim transfer.

create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_app_user_updated before update on app_user for each row execute function set_updated_at();
create trigger trg_host_updated before update on host for each row execute function set_updated_at();
create trigger trg_listing_updated before update on listing for each row execute function set_updated_at();
create trigger trg_seeker_state_updated before update on listing_seeker_state for each row execute function set_updated_at();
create trigger trg_winner_post_updated before update on winner_post for each row execute function set_updated_at();
create trigger trg_subscription_updated before update on subscription for each row execute function set_updated_at();
create trigger trg_notification_pref_updated before update on notification_pref for each row execute function set_updated_at();

-- Identity helpers. SECURITY DEFINER so they read app_user/host without tripping
-- RLS (prevents recursive policy evaluation). Clerk JWT 'sub' = clerk_user_id.
create or replace function current_clerk_user_id() returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select nullif(coalesce(auth.jwt() ->> 'sub', ''), '');
$$;

create or replace function current_app_user_id() returns uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select id from app_user where clerk_user_id = current_clerk_user_id();
$$;

create or replace function is_owner() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select is_owner from app_user where clerk_user_id = current_clerk_user_id()), false);
$$;

create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select is_admin from app_user where clerk_user_id = current_clerk_user_id()), false);
$$;

create or replace function is_host() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select is_host from app_user where clerk_user_id = current_clerk_user_id()), false);
$$;

create or replace function current_host_id() returns uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select h.id from host h
  join app_user u on u.id = h.app_user_id
  where u.clerk_user_id = current_clerk_user_id()
  limit 1;
$$;

-- Quality gate (blockers #1-#13). AI (#14) and billing (#15) enforced elsewhere.
create or replace function listing_publish_guard() returns trigger
language plpgsql as $$
begin
  if new.lifecycle_status = 'active' then
    if coalesce(new.title, '') = '' then raise exception 'publish blocked: title required'; end if;
    if coalesce(new.short_description, '') = '' then raise exception 'publish blocked: short_description required'; end if;
    if coalesce(new.prize_name, '') = '' then raise exception 'publish blocked: prize_name required'; end if;
    if new.main_image_url is null and new.category_fallback_image is null then
      raise exception 'publish blocked: main_image_url or category_fallback_image required';
    end if;
    if coalesce(new.entry_url, '') = '' then raise exception 'publish blocked: entry_url required'; end if;
    if new.official_rules_url is null and not new.official_rules_exception then
      raise exception 'publish blocked: official_rules_url or documented exception required';
    end if;
    if new.end_date is null or new.end_date < current_date then
      raise exception 'publish blocked: end_date must be present and in the future';
    end if;
    if new.entry_frequency is null then raise exception 'publish blocked: entry_frequency required'; end if;
    if coalesce(new.eligibility_country, '') = '' then raise exception 'publish blocked: eligibility_country required'; end if;
    if new.prize_category is null then raise exception 'publish blocked: prize_category required'; end if;
    if new.duplicate_status = 'confirmed' then raise exception 'publish blocked: confirmed duplicate'; end if;
    if new.moderation_status in ('action_taken', 'under_review') then raise exception 'publish blocked: moderation not clear'; end if;
    if new.visibility_status = 'hidden' then raise exception 'publish blocked: listing is hidden'; end if;
  end if;
  return new;
end;
$$;
create trigger trg_listing_publish_guard before insert or update on listing
  for each row execute function listing_publish_guard();

-- Entitlement cap: host-submitted active listings <= plan cap (hard max 10).
create or replace function enforce_active_listing_cap() returns trigger
language plpgsql as $$
declare
  cap int;
  active_count int;
begin
  if new.lifecycle_status = 'active' and new.host_id is not null and new.source_type = 'host_submitted' then
    select max_active_listings into cap from subscription
      where host_id = new.host_id order by created_at desc limit 1;
    cap := coalesce(cap, 1);
    select count(*) into active_count from listing
      where host_id = new.host_id and lifecycle_status = 'active' and id <> new.id;
    if active_count + 1 > cap then
      raise exception 'publish blocked: active listing cap (%) exceeded', cap;
    end if;
  end if;
  return new;
end;
$$;
create trigger trg_active_listing_cap before insert or update on listing
  for each row execute function enforce_active_listing_cap();

-- Only owner/admin (or service role w/ no JWT) may set trust/moderation fields.
create or replace function protect_listing_privileged_fields() returns trigger
language plpgsql as $$
begin
  if current_clerk_user_id() is null or is_owner() or is_admin() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.is_featured := false;
    new.listing_verification_status := 'unreviewed';
    new.moderation_status := 'clear';
    new.duplicate_status := 'clear';
    return new;
  elsif tg_op = 'UPDATE' then
    if new.is_featured is distinct from old.is_featured
      or new.listing_verification_status is distinct from old.listing_verification_status
      or new.moderation_status is distinct from old.moderation_status
      or new.duplicate_status is distinct from old.duplicate_status then
      raise exception 'not permitted: trust/moderation fields are admin-controlled';
    end if;
    return new;
  end if;
  return new;
end;
$$;
create trigger trg_protect_listing_fields before insert or update on listing
  for each row execute function protect_listing_privileged_fields();

create or replace function protect_app_user_roles() returns trigger
language plpgsql as $$
begin
  if current_clerk_user_id() is null or is_owner() or is_admin() then
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
create trigger trg_protect_app_user_roles before update on app_user
  for each row execute function protect_app_user_roles();

-- Claim approval reassigns ownership while preserving history.
create or replace function apply_listing_claim() returns trigger
language plpgsql as $$
begin
  if new.status = 'approved' and old.status is distinct from 'approved' then
    update listing set
      host_id = new.requesting_host_id,
      source_type = 'claimed_host',
      public_source_label = 'claimed_by_host',
      updated_at = now()
    where id = new.listing_id;
    new.reviewed_at = now();
  end if;
  return new;
end;
$$;
create trigger trg_apply_listing_claim before update on listing_claim
  for each row execute function apply_listing_claim();
