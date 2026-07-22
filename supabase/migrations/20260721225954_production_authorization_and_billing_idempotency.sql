-- Production authorization and Stripe idempotency hardening.
--
-- This migration closes the last direct-Data-API privilege escalation paths
-- and makes Stripe subscription application atomic, deduplicated, and ordered.
-- Provider activation remains a separate environment decision.

-- Fail closed if historical rows need a deliberate reconciliation before the
-- one-row-per-identity invariants can be installed.
do $$
declare
  v_duplicate text;
begin
  select app_user_id::text
    into v_duplicate
    from public.host
   group by app_user_id
  having count(*) > 1
   limit 1;
  if found then
    raise exception 'duplicate host.app_user_id requires reconciliation: %', v_duplicate;
  end if;

  select host_id::text
    into v_duplicate
    from public.subscription
   group by host_id
  having count(*) > 1
   limit 1;
  if found then
    raise exception 'duplicate subscription.host_id requires reconciliation: %', v_duplicate;
  end if;

  select stripe_subscription_id
    into v_duplicate
    from public.subscription
   where stripe_subscription_id is not null
   group by stripe_subscription_id
  having count(*) > 1
   limit 1;
  if found then
    raise exception 'duplicate Stripe subscription id requires reconciliation: %', v_duplicate;
  end if;

  select stripe_customer_id
    into v_duplicate
    from public.host
   where stripe_customer_id is not null
   group by stripe_customer_id
  having count(*) > 1
   limit 1;
  if found then
    raise exception 'duplicate Stripe customer id requires reconciliation: %', v_duplicate;
  end if;
end;
$$;

create unique index host_app_user_uidx on public.host (app_user_id);
create unique index host_stripe_customer_uidx
  on public.host (stripe_customer_id)
  where stripe_customer_id is not null;
create unique index subscription_host_uidx on public.subscription (host_id);
create unique index subscription_stripe_subscription_uidx
  on public.subscription (stripe_subscription_id)
  where stripe_subscription_id is not null;
create unique index boost_stripe_payment_uidx
  on public.boost (stripe_payment_id)
  where stripe_payment_id is not null;

alter table public.subscription
  alter column max_active_listings set default 1,
  add constraint subscription_included_range
    check (included_active_listings between 1 and 10),
  add constraint subscription_purchased_range
    check (purchased_additional_listings between 0 and 9),
  add constraint subscription_allowance_consistent
    check (
      max_active_listings
      = least(included_active_listings + purchased_additional_listings, 10)
    );

-- Every host-managed active listing consumes capacity, including an
-- official-source listing later claimed by a verified host. Counting only
-- host_submitted rows would let claimed inventory bypass paid limits.
create or replace function public.enforce_active_listing_cap()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cap integer;
  v_active_count integer;
begin
  if new.lifecycle_status = 'active' and new.host_id is not null then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('sweepza-listing-cap|' || new.host_id::text, 0)
    );
    select case
      when s.status in ('active', 'grace') then s.max_active_listings
      else 1
    end
      into v_cap
      from public.subscription s
     where s.host_id = new.host_id;
    v_cap := coalesce(v_cap, 1);

    select count(*)
      into v_active_count
      from public.listing l
     where l.host_id = new.host_id
       and l.lifecycle_status = 'active'
       and l.id <> new.id;
    if v_active_count + 1 > v_cap then
      raise exception 'publish blocked: active listing cap (%) exceeded', v_cap;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.enforce_active_listing_cap()
  from public, anon, authenticated;

-- Direct callers may never self-assign app roles, including on INSERT. Trusted
-- service-role synchronization has no Clerk identity and remains able to set
-- roles after an explicit admin decision.
create or replace function public.protect_app_user_roles()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if private.current_clerk_user_id() is null
     or private.is_owner()
     or private.is_admin() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.is_owner := false;
    new.is_admin := false;
    new.is_host := false;
    new.is_seeker := true;
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

drop trigger if exists trg_protect_app_user_roles on public.app_user;
create trigger trg_protect_app_user_roles
  before insert or update on public.app_user
  for each row execute function public.protect_app_user_roles();

-- Host verification and Stripe linkage are privileged. Profile owners may edit
-- descriptive fields, but neither direct API calls nor forged payloads can
-- verify themselves or attach a billing identity.
create function private.protect_host_privileged_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if private.current_clerk_user_id() is null
     or private.is_owner()
     or private.is_admin() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.app_user_id := private.current_app_user_id();
    new.verification_status := 'none'::public.host_verification_status;
    new.stripe_customer_id := null;
    return new;
  end if;

  if new.app_user_id is distinct from old.app_user_id
     or new.verification_status is distinct from old.verification_status
     or new.stripe_customer_id is distinct from old.stripe_customer_id then
    raise exception 'not permitted: host authority and billing fields are admin-controlled';
  end if;
  return new;
end;
$$;
revoke all on function private.protect_host_privileged_fields()
  from public, anon, authenticated, service_role;

drop trigger if exists trg_protect_host_privileged_fields on public.host;
create trigger trg_protect_host_privileged_fields
  before insert or update on public.host
  for each row execute function private.protect_host_privileged_fields();

drop policy if exists host_write on public.host;
create policy host_update_self on public.host for update
  using (app_user_id = private.current_app_user_id())
  with check (app_user_id = private.current_app_user_id());
create policy host_admin_write on public.host for all
  using (private.is_owner() or private.is_admin())
  with check (private.is_owner() or private.is_admin());
revoke insert, delete on public.host from authenticated;

-- User-created workflow rows start in their review state and cannot carry
-- forged moderator decisions. The server APIs use service role only after
-- authenticating the current Clerk user and supplying the trusted owner id.
create function private.protect_workflow_submission_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if private.current_clerk_user_id() is null
     or private.is_owner()
     or private.is_admin() then
    return new;
  end if;

  if tg_table_name = 'winner_post' then
    if tg_op = 'INSERT' then
      new.app_user_id := private.current_app_user_id();
      new.review_status := 'submitted'::public.winner_review_status;
      new.verified_win := false;
    elsif new.app_user_id is distinct from old.app_user_id
       or new.listing_id is distinct from old.listing_id
       or new.review_status is distinct from old.review_status
       or new.verified_win is distinct from old.verified_win then
      raise exception 'not permitted: winner review fields are moderator-controlled';
    end if;
  elsif tg_table_name = 'report' then
    if tg_op = 'INSERT' then
      new.reporter_user_id := private.current_app_user_id();
      new.status := 'submitted'::public.report_status;
      new.ai_severity := null;
      new.assigned_admin_id := null;
      new.resolved_at := null;
    end if;
  elsif tg_table_name = 'listing_claim' then
    if tg_op = 'INSERT' then
      new.requesting_host_id := private.current_host_id();
      new.status := 'requested'::public.claim_status;
      new.reviewed_by := null;
      new.reviewed_at := null;
    end if;
  end if;

  return new;
end;
$$;
revoke all on function private.protect_workflow_submission_fields()
  from public, anon, authenticated, service_role;

create trigger trg_protect_winner_submission
  before insert or update on public.winner_post
  for each row execute function private.protect_workflow_submission_fields();
create trigger trg_protect_report_submission
  before insert on public.report
  for each row execute function private.protect_workflow_submission_fields();
create trigger trg_protect_claim_submission
  before insert on public.listing_claim
  for each row execute function private.protect_workflow_submission_fields();

alter policy winner_post_insert on public.winner_post
  with check (
    app_user_id = private.current_app_user_id()
    and review_status = 'submitted'
    and verified_win = false
  );
alter policy report_insert on public.report
  with check (
    reporter_user_id = private.current_app_user_id()
    and status = 'submitted'
    and ai_severity is null
    and assigned_admin_id is null
    and resolved_at is null
  );
alter policy listing_claim_insert on public.listing_claim
  with check (
    requesting_host_id = private.current_host_id()
    and status = 'requested'
    and reviewed_by is null
    and reviewed_at is null
  );
create unique index listing_claim_one_open_request_uidx
  on public.listing_claim (listing_id, requesting_host_id)
  where status = 'requested';

-- Paid entitlements and boosts are service/admin writes. Hosts can inspect
-- their own billing state but cannot mint capacity or featured placement.
drop policy if exists subscription_owner on public.subscription;
create policy subscription_read_own on public.subscription for select
  using (
    host_id = private.current_host_id()
    or private.is_admin()
    or private.is_owner()
  );
create policy subscription_admin_write on public.subscription for all
  using (private.is_admin() or private.is_owner())
  with check (private.is_admin() or private.is_owner());
revoke all on public.subscription from authenticated;
grant select on public.subscription to authenticated;
grant select, insert, update, delete on public.subscription to service_role;

drop policy if exists boost_owner on public.boost;
create policy boost_read_own on public.boost for select
  using (
    host_id = private.current_host_id()
    or private.is_admin()
    or private.is_owner()
  );
create policy boost_admin_write on public.boost for all
  using (private.is_admin() or private.is_owner())
  with check (private.is_admin() or private.is_owner());
revoke all on public.boost from authenticated;
grant select on public.boost to authenticated;
grant select, insert, update, delete on public.boost to service_role;

-- Expiration is enforced at the database visibility boundary, not merely by a
-- best-effort cron. Tags follow the same parent visibility rule.
alter policy listing_public_select on public.listing using (
  (
    visibility_status = 'public'
    and lifecycle_status = 'active'
    and end_date >= current_date
    and listing_verification_status in ('reviewed', 'verified')
    and moderation_status not in ('under_review', 'action_taken')
  )
  or private.is_owner()
  or private.is_admin()
  or (host_id is not null and host_id = private.current_host_id())
);
alter policy listing_tag_select on public.listing_tag using (
  exists (
    select 1
      from public.listing l
     where l.id = listing_id
       and (
         (
           l.visibility_status = 'public'
           and l.lifecycle_status = 'active'
           and l.end_date >= current_date
           and l.listing_verification_status in ('reviewed', 'verified')
           and l.moderation_status not in ('under_review', 'action_taken')
         )
         or private.is_owner()
         or private.is_admin()
         or l.host_id = private.current_host_id()
       )
  )
);

-- A public active listing must carry the exact evidence behind Sweepza's
-- consumer trust promises. Unknown or suspected facts remain reviewable drafts.
create or replace function public.listing_publish_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.lifecycle_status = 'active' then
    if coalesce(new.title, '') = '' then raise exception 'publish blocked: title required'; end if;
    if coalesce(new.short_description, '') = '' then raise exception 'publish blocked: short_description required'; end if;
    if coalesce(new.prize_name, '') = '' then raise exception 'publish blocked: prize_name required'; end if;
    if coalesce(new.sponsor_name, '') = '' then raise exception 'publish blocked: sponsor_name required'; end if;
    if new.main_image_url is null and new.category_fallback_image is null then
      raise exception 'publish blocked: main_image_url or category_fallback_image required';
    end if;
    if coalesce(new.entry_url, '') = '' then raise exception 'publish blocked: entry_url required'; end if;
    if coalesce(new.official_rules_url, '') = '' then raise exception 'publish blocked: official_rules_url required'; end if;
    if new.end_date is null or new.end_date < current_date then
      raise exception 'publish blocked: end_date must be current or future';
    end if;
    if new.entry_frequency is null then raise exception 'publish blocked: entry_frequency required'; end if;
    if coalesce(new.eligibility_country, '') = '' then raise exception 'publish blocked: eligibility_country required'; end if;
    if new.no_purchase_necessary is distinct from true then
      raise exception 'publish blocked: no_purchase_necessary must be confirmed';
    end if;
    if new.prize_category is null then raise exception 'publish blocked: prize_category required'; end if;
    if new.duplicate_status <> 'clear' then raise exception 'publish blocked: duplicate review unresolved'; end if;
    if new.moderation_status <> 'clear' then raise exception 'publish blocked: moderation not clear'; end if;
    if new.listing_verification_status not in ('reviewed', 'verified') then
      raise exception 'publish blocked: listing review required';
    end if;
    if new.visibility_status <> 'public' then
      raise exception 'publish blocked: active listings must be public';
    end if;
  end if;
  return new;
end;
$$;

create function public.expire_stale_listings(p_today date)
returns table (slug text)
language sql
volatile
security definer
set search_path = ''
as $$
  update public.listing
     set lifecycle_status = 'expired'::public.lifecycle_status
   where lifecycle_status = 'active'::public.lifecycle_status
     and end_date < p_today
  returning listing.slug;
$$;
comment on function public.expire_stale_listings(date) is
  'Atomically expires every active listing past its inclusive end date. Service role only.';
revoke all on function public.expire_stale_listings(date)
  from public, anon, authenticated;
grant execute on function public.expire_stale_listings(date) to service_role;

-- Durable Stripe event ledger and ordered subscription state.
alter table public.subscription
  add column stripe_event_id text,
  add column stripe_event_type text,
  add column stripe_event_created_at bigint,
  add column stripe_event_priority integer not null default 0;

create table private.stripe_webhook_event (
  event_id text primary key,
  event_type text not null,
  stripe_object_id text not null,
  stripe_created_at bigint not null,
  livemode boolean not null,
  outcome text not null
    check (outcome in ('processed', 'ignored_stale', 'ignored_superseded')),
  host_id uuid references public.host(id) on delete set null,
  subscription_id uuid references public.subscription(id) on delete set null,
  affected_listing_ids uuid[] not null default '{}'::uuid[],
  received_at timestamptz not null default now(),
  processed_at timestamptz not null default now()
);
create index stripe_webhook_event_created_idx
  on private.stripe_webhook_event (stripe_created_at desc);
revoke all on private.stripe_webhook_event from public, anon, authenticated, service_role;
grant select on private.stripe_webhook_event to service_role;

create function public.apply_stripe_subscription_event(
  p_event_id text,
  p_event_type text,
  p_event_created_at bigint,
  p_livemode boolean,
  p_host_id uuid,
  p_stripe_customer_id text,
  p_stripe_subscription_id text,
  p_status public.subscription_status,
  p_included_active_listings integer,
  p_purchased_additional_listings integer,
  p_max_active_listings integer,
  p_founding_host_number integer,
  p_founding_discount_percent integer,
  p_founding_discount_retained boolean
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing public.subscription%rowtype;
  v_subscription_id uuid;
  v_inserted_event_id text;
  v_existing_outcome text;
  v_event_priority integer := case p_event_type
    when 'customer.subscription.created' then 10
    when 'customer.subscription.updated' then 20
    when 'customer.subscription.deleted' then 30
    else 0
  end;
  v_outcome text := 'processed';
  v_effective_cap integer;
  v_affected_listing_ids uuid[] := '{}'::uuid[];
begin
  if nullif(btrim(p_event_id), '') is null
     or char_length(p_event_id) > 255
     or nullif(btrim(p_stripe_subscription_id), '') is null
     or nullif(btrim(p_stripe_customer_id), '') is null
     or p_event_created_at < 1
     or v_event_priority = 0 then
    raise exception 'invalid Stripe subscription event' using errcode = '22023';
  end if;

  if not exists (
    select 1
      from public.host h
     where h.id = p_host_id
       and h.stripe_customer_id = p_stripe_customer_id
  ) then
    raise exception 'Stripe customer does not match Sweepza host' using errcode = '23514';
  end if;

  if p_included_active_listings < 1
     or p_included_active_listings > 10
     or p_purchased_additional_listings < 0
     or p_purchased_additional_listings > 9
     or p_max_active_listings <> least(
       p_included_active_listings + p_purchased_additional_listings,
       10
     )
     or p_founding_host_number is not null
     or p_founding_discount_percent is not null
     or p_founding_discount_retained then
    raise exception 'invalid Stripe entitlement metadata' using errcode = '23514';
  end if;

  insert into private.stripe_webhook_event (
    event_id,
    event_type,
    stripe_object_id,
    stripe_created_at,
    livemode,
    outcome,
    host_id
  ) values (
    p_event_id,
    p_event_type,
    p_stripe_subscription_id,
    p_event_created_at,
    p_livemode,
    'processed',
    p_host_id
  )
  on conflict (event_id) do nothing
  returning event_id into v_inserted_event_id;

  if v_inserted_event_id is null then
    select outcome, subscription_id
      into v_existing_outcome, v_subscription_id
      from private.stripe_webhook_event
     where event_id = p_event_id;
    return jsonb_build_object(
      'outcome', 'duplicate',
      'original_outcome', v_existing_outcome,
      'subscription_id', v_subscription_id
    );
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('sweepza-stripe-host|' || p_host_id::text, 0)
  );

  select *
    into v_existing
    from public.subscription
   where host_id = p_host_id
   for update;

  if found then
    if v_existing.stripe_event_created_at is not null
       and (
         v_existing.stripe_event_created_at > p_event_created_at
         or (
           v_existing.stripe_event_created_at = p_event_created_at
           and v_existing.stripe_event_priority > v_event_priority
         )
       ) then
      v_outcome := 'ignored_stale';
    elsif v_existing.stripe_subscription_id is distinct from p_stripe_subscription_id
       and not (
         v_existing.status in ('no_plan', 'canceled')
         and p_event_type = 'customer.subscription.created'
       ) then
      raise exception 'competing active Stripe subscription requires reconciliation'
        using errcode = '23514';
    end if;
  end if;

  if v_outcome = 'processed' then
    insert into public.subscription (
      host_id,
      stripe_subscription_id,
      status,
      included_active_listings,
      purchased_additional_listings,
      max_active_listings,
      founding_host_number,
      founding_discount_percent,
      founding_discount_retained,
      stripe_event_id,
      stripe_event_type,
      stripe_event_created_at,
      stripe_event_priority
    ) values (
      p_host_id,
      p_stripe_subscription_id,
      p_status,
      p_included_active_listings,
      p_purchased_additional_listings,
      p_max_active_listings,
      null,
      null,
      false,
      p_event_id,
      p_event_type,
      p_event_created_at,
      v_event_priority
    )
    on conflict (host_id) do update set
      stripe_subscription_id = excluded.stripe_subscription_id,
      status = excluded.status,
      included_active_listings = excluded.included_active_listings,
      purchased_additional_listings = excluded.purchased_additional_listings,
      max_active_listings = excluded.max_active_listings,
      stripe_event_id = excluded.stripe_event_id,
      stripe_event_type = excluded.stripe_event_type,
      stripe_event_created_at = excluded.stripe_event_created_at,
      stripe_event_priority = excluded.stripe_event_priority
    returning id into v_subscription_id;

    -- A paid-capacity downshift must take effect atomically with the billing
    -- event. Keep the soonest-ending campaigns live and make every excess row
    -- recoverably inactive; a host can reactivate it once capacity returns.
    v_effective_cap := case
      when p_status in ('active', 'grace') then p_max_active_listings
      else 1
    end;
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('sweepza-listing-cap|' || p_host_id::text, 0)
    );
    with ranked as (
      select l.id,
             row_number() over (
               order by l.end_date asc, l.published_at asc nulls last, l.id
             ) as position
        from public.listing l
       where l.host_id = p_host_id
         and l.lifecycle_status = 'active'
    ), excess as (
      select id from ranked where position > v_effective_cap
    ), paused as (
      update public.listing l
         set lifecycle_status = 'inactive'::public.lifecycle_status,
             visibility_status = 'unlisted',
             review_notes = 'Paused automatically because the host listing allowance decreased.'
        from excess e
       where l.id = e.id
      returning l.id
    )
    select coalesce(array_agg(id order by id), '{}'::uuid[])
      into v_affected_listing_ids
      from paused;
  else
    v_subscription_id := v_existing.id;
  end if;

  update private.stripe_webhook_event
     set outcome = v_outcome,
         subscription_id = v_subscription_id,
         affected_listing_ids = v_affected_listing_ids,
         processed_at = clock_timestamp()
   where event_id = p_event_id;

  return jsonb_build_object(
    'outcome', v_outcome,
    'subscription_id', v_subscription_id,
    'status', case when v_outcome = 'processed' then p_status::text else v_existing.status::text end
  );
end;
$$;

comment on function public.apply_stripe_subscription_event(
  text, text, bigint, boolean, uuid, text, text, public.subscription_status,
  integer, integer, integer, integer, integer, boolean
) is
  'Atomically deduplicates and orders Sweepza Stripe subscription events. Service role only.';
revoke all on function public.apply_stripe_subscription_event(
  text, text, bigint, boolean, uuid, text, text, public.subscription_status,
  integer, integer, integer, integer, integer, boolean
) from public, anon, authenticated;
grant execute on function public.apply_stripe_subscription_event(
  text, text, bigint, boolean, uuid, text, text, public.subscription_status,
  integer, integer, integer, integer, integer, boolean
) to service_role;

-- Winner Wall submissions are tied to an entered listing and every editorial
-- decision is attributable. The service API authenticates Clerk users before
-- using these service-role-only write paths.
do $$
begin
  if exists (
    select 1
      from public.winner_post
     where listing_id is null
        or caption is null
        or char_length(btrim(caption)) < 10
  ) then
    raise exception 'winner posts require reconciliation before launch hardening';
  end if;
end;
$$;

alter table public.winner_post
  alter column listing_id set not null,
  alter column caption set not null,
  add column reviewed_by uuid references public.app_user(id) on delete set null,
  add column reviewed_at timestamptz,
  add column review_notes text,
  add column verification_evidence_url text,
  add constraint winner_caption_material check (
    char_length(btrim(caption)) between 10 and 500
  ),
  add constraint winner_review_notes_len check (
    review_notes is null or char_length(review_notes) <= 2000
  ),
  add constraint winner_verification_evidence_https check (
    verification_evidence_url is null
    or verification_evidence_url ~ '^https://[^[:space:]]+$'
  ),
  add constraint winner_verified_requires_public_evidence check (
    verified_win = false
    or (
      review_status = 'published'
      and verification_evidence_url is not null
      and reviewed_by is not null
      and reviewed_at is not null
    )
  );

-- External winner-photo URLs leak viewer IPs to an untrusted host. Clear the
-- dormant field and keep it null until Sweepza has a first-party validated
-- upload pipeline.
update public.winner_post set photo_url = null where photo_url is not null;
alter table public.winner_post
  add constraint winner_remote_photo_disabled check (photo_url is null);

-- Public Winner Wall reads may see only publishable content. Reviewer notes,
-- reviewer identity, timestamps, and evidence URLs remain service-only even
-- when a row is published.
revoke select on public.winner_post from anon, authenticated;
grant select (
  id,
  app_user_id,
  listing_id,
  caption,
  verified_win,
  review_status,
  created_at,
  updated_at
) on public.winner_post to anon, authenticated;

create unique index winner_post_one_open_or_published_per_listing_uidx
  on public.winner_post (app_user_id, listing_id)
  where review_status in ('submitted', 'pending_review', 'published');

create table private.winner_moderation_event (
  id uuid primary key default gen_random_uuid(),
  winner_post_id uuid not null references public.winner_post(id) on delete cascade,
  reviewer_user_id uuid references public.app_user(id) on delete set null,
  previous_status public.winner_review_status not null,
  new_status public.winner_review_status not null,
  verified_win boolean not null,
  review_notes text,
  verification_evidence_url text,
  created_at timestamptz not null default now()
);
create index winner_moderation_event_post_idx
  on private.winner_moderation_event (winner_post_id, created_at desc);
revoke all on private.winner_moderation_event
  from public, anon, authenticated, service_role;
grant select on private.winner_moderation_event to service_role;

create function public.moderate_winner_post(
  p_winner_post_id uuid,
  p_reviewer_user_id uuid,
  p_action text,
  p_verified_win boolean,
  p_review_notes text,
  p_verification_evidence_url text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_post public.winner_post%rowtype;
  v_previous_status public.winner_review_status;
  v_next_status public.winner_review_status;
  v_next_verified boolean;
  v_next_evidence text;
begin
  if not exists (
    select 1
      from public.app_user au
     where au.id = p_reviewer_user_id
       and (au.is_admin or au.is_owner)
  ) then
    raise exception 'admin or owner reviewer required' using errcode = '42501';
  end if;

  if p_action not in ('publish', 'reject', 'hide')
     or char_length(coalesce(p_review_notes, '')) > 2000 then
    raise exception 'invalid winner moderation request' using errcode = '22023';
  end if;

  if p_verified_win and (
    p_action <> 'publish'
    or coalesce(p_verification_evidence_url, '') !~ '^https://[^[:space:]]+$'
  ) then
    raise exception 'verified wins require an HTTPS evidence URL' using errcode = '22023';
  end if;

  select *
    into v_post
    from public.winner_post
   where id = p_winner_post_id
   for update;
  if not found then
    raise exception 'winner post not found' using errcode = 'P0002';
  end if;
  v_previous_status := v_post.review_status;

  if p_action = 'publish' then
    if v_post.review_status not in ('submitted', 'pending_review', 'hidden') then
      raise exception 'winner post cannot be published from %', v_post.review_status
        using errcode = '23514';
    end if;
    v_next_status := 'published';
    v_next_verified := p_verified_win;
    v_next_evidence := case when p_verified_win then p_verification_evidence_url else null end;
  elsif p_action = 'reject' then
    if v_post.review_status not in ('submitted', 'pending_review') then
      raise exception 'winner post cannot be rejected from %', v_post.review_status
        using errcode = '23514';
    end if;
    if nullif(btrim(coalesce(p_review_notes, '')), '') is null then
      raise exception 'rejection notes are required' using errcode = '22023';
    end if;
    v_next_status := 'rejected';
    v_next_verified := false;
    v_next_evidence := null;
  else
    if v_post.review_status <> 'published' then
      raise exception 'only published winner posts can be hidden' using errcode = '23514';
    end if;
    if nullif(btrim(coalesce(p_review_notes, '')), '') is null then
      raise exception 'hide notes are required' using errcode = '22023';
    end if;
    v_next_status := 'hidden';
    v_next_verified := false;
    v_next_evidence := v_post.verification_evidence_url;
  end if;

  update public.winner_post
     set review_status = v_next_status,
         verified_win = v_next_verified,
         reviewed_by = p_reviewer_user_id,
         reviewed_at = clock_timestamp(),
         review_notes = nullif(btrim(coalesce(p_review_notes, '')), ''),
         verification_evidence_url = v_next_evidence
   where id = p_winner_post_id
   returning * into v_post;

  insert into private.winner_moderation_event (
    winner_post_id,
    reviewer_user_id,
    previous_status,
    new_status,
    verified_win,
    review_notes,
    verification_evidence_url
  ) values (
    p_winner_post_id,
    p_reviewer_user_id,
    v_previous_status,
    v_next_status,
    v_next_verified,
    nullif(btrim(coalesce(p_review_notes, '')), ''),
    v_next_evidence
  );

  return jsonb_build_object(
    'id', v_post.id,
    'app_user_id', v_post.app_user_id,
    'listing_id', v_post.listing_id,
    'review_status', v_post.review_status,
    'verified_win', v_post.verified_win
  );
end;
$$;
comment on function public.moderate_winner_post(uuid, uuid, text, boolean, text, text) is
  'Atomically moderates and audits a Winner Wall post. Service role only.';
revoke all on function public.moderate_winner_post(uuid, uuid, text, boolean, text, text)
  from public, anon, authenticated;
grant execute on function public.moderate_winner_post(uuid, uuid, text, boolean, text, text)
  to service_role;

-- Public reactions are visible and writable only through published Winner Wall
-- posts. The application route owns authenticated toggles.
alter policy winner_reaction_select on public.winner_reaction using (
  exists (
    select 1
      from public.winner_post wp
     where wp.id = winner_post_id
       and wp.review_status = 'published'
  )
);
revoke insert, update, delete on public.winner_post from authenticated;
revoke insert, update, delete on public.winner_reaction from authenticated;
revoke insert, update on public.report from authenticated;
revoke insert, update on public.listing_claim from authenticated;
grant select, insert, update, delete on public.winner_post to service_role;
grant select, insert, update, delete on public.winner_reaction to service_role;
grant select, insert, update, delete on public.report to service_role;
grant select, insert, update, delete on public.listing_claim to service_role;

-- Listing mutations must pass through authenticated server services so URL,
-- provenance, duplicate, review, and lifecycle invariants cannot be bypassed by
-- a direct Data API request.
revoke insert, update, delete on public.listing from authenticated;
revoke insert, update, delete on public.listing_tag from authenticated;
grant select, insert, update, delete on public.listing to service_role;
grant select, insert, update, delete on public.listing_tag to service_role;

-- Complete operator/host canonical creation in the same transaction that
-- claims ingestion identity. A failed material update, tag attach, or publish
-- therefore cannot strand an unusable provenance row.
create function public.create_canonical_listing(
  p_candidate jsonb,
  p_provenance jsonb,
  p_write jsonb,
  p_tag_codes text[]
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_claimed jsonb;
  v_listing_id uuid;
  v_listing public.listing%rowtype;
  v_kind text := p_write ->> 'kind';
  v_actor_id uuid := (p_write ->> 'actorAppUserId')::uuid;
  v_host_id uuid := nullif(p_write ->> 'hostId', '')::uuid;
  v_publish boolean := coalesce((p_write ->> 'publish')::boolean, false);
  v_verified boolean := coalesce((p_write ->> 'verified')::boolean, false);
  v_suspected jsonb;
  v_idempotent boolean := false;
  v_review_status public.listing_verification_status;
begin
  if v_kind not in ('admin_official', 'host_submission') then
    raise exception 'invalid canonical listing origin' using errcode = '22023';
  end if;

  if v_kind = 'admin_official' then
    if not exists (
      select 1 from public.app_user au
       where au.id = v_actor_id and (au.is_admin or au.is_owner)
    ) then
      raise exception 'admin or owner actor required' using errcode = '42501';
    end if;
    if v_host_id is not null then
      raise exception 'admin official writes cannot forge host ownership' using errcode = '22023';
    end if;
    v_review_status := case when v_verified
      then 'verified'::public.listing_verification_status
      else 'reviewed'::public.listing_verification_status
    end;
  else
    if v_publish or v_verified
       or v_host_id is null
       or not exists (
         select 1
           from public.host h
          where h.id = v_host_id
            and h.app_user_id = v_actor_id
            and h.account_status = 'active'
       ) then
      raise exception 'active authenticated host authority required' using errcode = '42501';
    end if;
    v_review_status := 'unreviewed'::public.listing_verification_status;
  end if;

  if not exists (
    select 1 from public.category c
     where c.code = p_candidate ->> 'prizeCategory' and c.is_active
  ) or exists (
    select 1
      from unnest(coalesce(p_tag_codes, '{}'::text[])) requested(code)
      left join public.tag t on t.code = requested.code and t.is_active
     where t.code is null
  ) then
    raise exception 'inactive category or tag' using errcode = '23514';
  end if;

  v_claimed := public.create_ingested_listing_with_provenance(
    p_candidate,
    p_provenance
  );
  v_listing_id := (v_claimed ->> 'listing_id')::uuid;
  v_suspected := coalesce(v_claimed -> 'suspected_duplicate_ids', '[]'::jsonb);

  if not coalesce((v_claimed ->> 'created')::boolean, false) then
    select l.*
      into v_listing
      from public.listing l
      join public.listing_ingestion li on li.listing_id = l.id
     where l.id = v_listing_id
       and l.created_by_user_id = v_actor_id
       and li.discovery_source = p_provenance ->> 'discoverySource'
       and li.content_hash = p_provenance ->> 'contentHash';
    v_idempotent := found;
    return jsonb_build_object(
      'listing_id', v_listing_id,
      'slug', case when v_idempotent then v_listing.slug else null end,
      'created', false,
      'idempotent', v_idempotent,
      'published', case when v_idempotent
        then v_listing.lifecycle_status = 'active' and v_listing.visibility_status = 'public'
        else false end,
      'suspected_duplicate_ids', v_suspected
    );
  end if;

  update public.listing
     set long_description = nullif(p_candidate ->> 'longDescription', ''),
         winner_count = nullif(p_write ->> 'winnerCount', '')::integer,
         entry_limit_notes = nullif(p_write ->> 'entryLimitNotes', ''),
         eligibility_states = case
           when jsonb_typeof(p_candidate -> 'eligibilityStates') = 'array'
                and jsonb_array_length(p_candidate -> 'eligibilityStates') > 0
             then array(select jsonb_array_elements_text(p_candidate -> 'eligibilityStates'))
           else null
         end,
         age_requirement = (p_candidate ->> 'ageRequirement')::integer,
         no_purchase_necessary = (p_candidate ->> 'noPurchaseNecessary')::boolean,
         sponsor_name = p_candidate ->> 'sponsorName',
         sponsor_url = nullif(p_candidate ->> 'sponsorUrl', ''),
         source_type = case when v_kind = 'admin_official'
           then 'owner_seeded'::public.source_type else 'host_submitted'::public.source_type end,
         public_source_label = case when v_kind = 'admin_official'
           then 'found_by_sweepza'::public.source_label else 'host_submitted'::public.source_label end,
         created_by_role = case when v_kind = 'admin_official'
           then 'owner'::public.created_by_role else 'host'::public.created_by_role end,
         created_by_user_id = v_actor_id,
         host_id = v_host_id,
         lifecycle_status = 'draft',
         visibility_status = 'private',
         listing_verification_status = v_review_status,
         published_at = null
   where id = v_listing_id
   returning * into v_listing;

  insert into public.listing_tag (listing_id, tag_code)
  select v_listing_id, requested.code
    from (select distinct unnest(coalesce(p_tag_codes, '{}'::text[])) as code) requested;

  if v_publish and jsonb_array_length(v_suspected) = 0 then
    update public.listing
       set lifecycle_status = 'active',
           visibility_status = 'public',
           listing_verification_status = v_review_status,
           published_at = clock_timestamp()
     where id = v_listing_id
     returning * into v_listing;
  end if;

  return jsonb_build_object(
    'listing_id', v_listing.id,
    'slug', v_listing.slug,
    'created', true,
    'idempotent', false,
    'published', v_listing.lifecycle_status = 'active' and v_listing.visibility_status = 'public',
    'suspected_duplicate_ids', v_suspected
  );
end;
$$;
comment on function public.create_canonical_listing(jsonb, jsonb, jsonb, text[]) is
  'Atomically claims identity, preserves provenance, attaches tags, and optionally publishes an authorized canonical listing.';
revoke all on function public.create_canonical_listing(jsonb, jsonb, jsonb, text[])
  from public, anon, authenticated;
grant execute on function public.create_canonical_listing(jsonb, jsonb, jsonb, text[])
  to service_role;
