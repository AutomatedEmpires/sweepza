-- Host authority applications and attributable operator decisions.

alter table public.host
  add column account_status text not null default 'active'
    check (account_status in ('active', 'suspended')),
  add column verification_evidence_url text,
  add column verified_by uuid references public.app_user(id) on delete set null,
  add column verified_at timestamptz,
  add column suspended_reason text,
  add column suspended_by uuid references public.app_user(id) on delete set null,
  add column suspended_at timestamptz,
  add constraint host_verification_evidence_https check (
    verification_evidence_url is null
    or verification_evidence_url ~ '^https://[^[:space:]]+$'
  ),
  add constraint host_suspension_consistent check (
    (account_status = 'active' and suspended_reason is null and suspended_at is null)
    or
    (account_status = 'suspended' and suspended_reason is not null and suspended_at is not null)
  );

-- The first hardening migration predates these columns. Extend the existing
-- self-update trigger so a host cannot reactivate or verify itself, erase
-- suspension evidence, or forge reviewer identity through the Data API.
create or replace function private.protect_host_privileged_fields()
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
    new.account_status := 'active';
    new.verification_evidence_url := null;
    new.verified_by := null;
    new.verified_at := null;
    new.suspended_reason := null;
    new.suspended_by := null;
    new.suspended_at := null;
    return new;
  end if;

  if new.app_user_id is distinct from old.app_user_id
     or new.verification_status is distinct from old.verification_status
     or new.stripe_customer_id is distinct from old.stripe_customer_id
     or new.account_status is distinct from old.account_status
     or new.verification_evidence_url is distinct from old.verification_evidence_url
     or new.verified_by is distinct from old.verified_by
     or new.verified_at is distinct from old.verified_at
     or new.suspended_reason is distinct from old.suspended_reason
     or new.suspended_by is distinct from old.suspended_by
     or new.suspended_at is distinct from old.suspended_at then
    raise exception 'not permitted: host authority, suspension, and billing fields are admin-controlled';
  end if;
  return new;
end;
$$;

create table public.host_application (
  id uuid primary key default gen_random_uuid(),
  applicant_user_id uuid not null references public.app_user(id) on delete cascade,
  legal_organization_name text not null,
  public_display_name text not null,
  website_url text not null,
  official_email text not null,
  authority_basis text not null
    check (authority_basis in ('owner', 'employee', 'agency', 'administrator')),
  authority_evidence text not null,
  authority_evidence_url text,
  status text not null default 'submitted'
    check (status in ('submitted', 'under_review', 'approved', 'rejected', 'withdrawn')),
  authority_attested boolean not null,
  terms_version text not null,
  reviewer_user_id uuid references public.app_user(id) on delete set null,
  review_notes text,
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint host_application_legal_name_len check (
    char_length(btrim(legal_organization_name)) between 2 and 160
  ),
  constraint host_application_public_name_len check (
    char_length(btrim(public_display_name)) between 2 and 100
  ),
  constraint host_application_website_https check (
    website_url ~ '^https://[^[:space:]]+$'
  ),
  constraint host_application_official_email_shape check (
    official_email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ),
  constraint host_application_evidence_len check (
    char_length(btrim(authority_evidence)) between 20 and 2000
  ),
  constraint host_application_evidence_url_https check (
    authority_evidence_url is null
    or authority_evidence_url ~ '^https://[^[:space:]]+$'
  ),
  constraint host_application_attestation_required check (authority_attested),
  constraint host_application_review_notes_len check (
    review_notes is null or char_length(review_notes) <= 2000
  )
);
create unique index host_application_one_open_uidx
  on public.host_application (applicant_user_id)
  where status in ('submitted', 'under_review');
create index host_application_review_queue_idx
  on public.host_application (status, submitted_at);

alter table public.host_application enable row level security;
create policy host_application_read_own on public.host_application for select
  using (
    applicant_user_id = private.current_app_user_id()
    or private.is_admin()
    or private.is_owner()
  );
revoke all on public.host_application from public, anon, authenticated;
grant select on public.host_application to authenticated;
grant select, insert, update, delete on public.host_application to service_role;

create trigger trg_host_application_updated
  before update on public.host_application
  for each row execute function public.set_updated_at();

create table private.operator_audit_event (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references public.app_user(id) on delete set null,
  action text not null,
  target_type text not null,
  target_id uuid not null,
  previous_state jsonb,
  new_state jsonb,
  notes text,
  evidence_url text,
  created_at timestamptz not null default now()
);
create index operator_audit_event_target_idx
  on private.operator_audit_event (target_type, target_id, created_at desc);
revoke all on private.operator_audit_event from public, anon, authenticated, service_role;
grant select on private.operator_audit_event to service_role;

create function public.review_host_application(
  p_application_id uuid,
  p_reviewer_user_id uuid,
  p_action text,
  p_review_notes text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_application public.host_application%rowtype;
  v_previous_status text;
  v_host_id uuid;
begin
  if not exists (
    select 1
      from public.app_user au
     where au.id = p_reviewer_user_id
       and (au.is_admin or au.is_owner)
  ) then
    raise exception 'admin or owner reviewer required' using errcode = '42501';
  end if;
  if p_action not in ('approve', 'reject')
     or nullif(btrim(coalesce(p_review_notes, '')), '') is null
     or char_length(p_review_notes) > 2000 then
    raise exception 'valid host review action and notes are required' using errcode = '22023';
  end if;

  select *
    into v_application
    from public.host_application
   where id = p_application_id
   for update;
  if not found then
    raise exception 'host application not found' using errcode = 'P0002';
  end if;
  if v_application.status not in ('submitted', 'under_review') then
    raise exception 'host application is already resolved' using errcode = '23514';
  end if;
  v_previous_status := v_application.status;

  if p_action = 'approve' then
    insert into public.host (
      app_user_id,
      display_name,
      website_url,
      short_description,
      verification_status,
      account_status,
      verification_evidence_url,
      verified_by,
      verified_at
    ) values (
      v_application.applicant_user_id,
      v_application.public_display_name,
      v_application.website_url,
      left(v_application.authority_evidence, 300),
      'admin_verified',
      'active',
      v_application.authority_evidence_url,
      p_reviewer_user_id,
      clock_timestamp()
    )
    on conflict (app_user_id) do update set
      display_name = excluded.display_name,
      website_url = excluded.website_url,
      verification_status = excluded.verification_status,
      account_status = 'active',
      verification_evidence_url = excluded.verification_evidence_url,
      verified_by = excluded.verified_by,
      verified_at = excluded.verified_at,
      suspended_reason = null,
      suspended_by = null,
      suspended_at = null
    returning id into v_host_id;

    update public.app_user
       set is_host = true
     where id = v_application.applicant_user_id;

    update public.host_application
       set status = 'approved',
           reviewer_user_id = p_reviewer_user_id,
           review_notes = btrim(p_review_notes),
           reviewed_at = clock_timestamp()
     where id = p_application_id;
  else
    update public.host_application
       set status = 'rejected',
           reviewer_user_id = p_reviewer_user_id,
           review_notes = btrim(p_review_notes),
           reviewed_at = clock_timestamp()
     where id = p_application_id;
  end if;

  insert into private.operator_audit_event (
    actor_user_id,
    action,
    target_type,
    target_id,
    previous_state,
    new_state,
    notes,
    evidence_url
  ) values (
    p_reviewer_user_id,
    'host_application.' || p_action,
    'host_application',
    p_application_id,
    jsonb_build_object('status', v_previous_status),
    jsonb_build_object(
      'status', case when p_action = 'approve' then 'approved' else 'rejected' end,
      'host_id', v_host_id
    ),
    btrim(p_review_notes),
    v_application.authority_evidence_url
  );

  return jsonb_build_object(
    'application_id', p_application_id,
    'status', case when p_action = 'approve' then 'approved' else 'rejected' end,
    'host_id', v_host_id
  );
end;
$$;
revoke all on function public.review_host_application(uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.review_host_application(uuid, uuid, text, text)
  to service_role;

create function public.moderate_host(
  p_host_id uuid,
  p_actor_user_id uuid,
  p_action text,
  p_notes text,
  p_evidence_url text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_host public.host%rowtype;
begin
  if not exists (
    select 1
      from public.app_user au
     where au.id = p_actor_user_id
       and (au.is_admin or au.is_owner)
  ) then
    raise exception 'admin or owner actor required' using errcode = '42501';
  end if;
  if p_action not in ('verify', 'suspend')
     or nullif(btrim(coalesce(p_notes, '')), '') is null
     or char_length(p_notes) > 2000 then
    raise exception 'valid host action and notes are required' using errcode = '22023';
  end if;
  if p_action = 'verify'
     and coalesce(p_evidence_url, '') !~ '^https://[^[:space:]]+$' then
    raise exception 'host verification requires an HTTPS evidence URL' using errcode = '22023';
  end if;

  select * into v_host from public.host where id = p_host_id for update;
  if not found then
    raise exception 'host not found' using errcode = 'P0002';
  end if;

  if p_action = 'verify' then
    update public.host
       set verification_status = 'admin_verified',
           account_status = 'active',
           verification_evidence_url = p_evidence_url,
           verified_by = p_actor_user_id,
           verified_at = clock_timestamp(),
           suspended_reason = null,
           suspended_by = null,
           suspended_at = null
     where id = p_host_id;
    update public.listing
       set lifecycle_status = 'inactive',
           visibility_status = 'unlisted',
           review_notes = null
     where host_id = p_host_id
       and lifecycle_status = 'paused'
       and visibility_status = 'hidden'
       and review_notes = 'Paused automatically because the host account was suspended.';
  else
    update public.host
       set verification_status = 'none',
           account_status = 'suspended',
           suspended_reason = btrim(p_notes),
           suspended_by = p_actor_user_id,
           suspended_at = clock_timestamp()
     where id = p_host_id;
    update public.listing
       set lifecycle_status = 'paused',
           visibility_status = 'hidden',
           review_notes = 'Paused automatically because the host account was suspended.'
     where host_id = p_host_id
       and lifecycle_status = 'active';
  end if;

  insert into private.operator_audit_event (
    actor_user_id,
    action,
    target_type,
    target_id,
    previous_state,
    new_state,
    notes,
    evidence_url
  ) values (
    p_actor_user_id,
    'host.' || p_action,
    'host',
    p_host_id,
    jsonb_build_object(
      'verification_status', v_host.verification_status,
      'account_status', v_host.account_status
    ),
    jsonb_build_object(
      'verification_status', case when p_action = 'verify' then 'admin_verified' else 'none' end,
      'account_status', case when p_action = 'verify' then 'active' else 'suspended' end
    ),
    btrim(p_notes),
    p_evidence_url
  );

  return jsonb_build_object(
    'host_id', p_host_id,
    'verification_status', case when p_action = 'verify' then 'admin_verified' else 'none' end,
    'account_status', case when p_action = 'verify' then 'active' else 'suspended' end
  );
end;
$$;
revoke all on function public.moderate_host(uuid, uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.moderate_host(uuid, uuid, text, text, text)
  to service_role;

create function private.prevent_suspended_host_publication()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.host_id is not null
     and new.lifecycle_status = 'active'
     and new.visibility_status = 'public'
     and exists (
       select 1
         from public.host h
        where h.id = new.host_id
          and h.account_status <> 'active'
     ) then
    raise exception 'suspended hosts cannot publish listings' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function private.prevent_suspended_host_publication()
  from public, anon, authenticated, service_role;
create trigger trg_prevent_suspended_host_publication
  before insert or update on public.listing
  for each row execute function private.prevent_suspended_host_publication();

create function public.review_canonical_listing(
  p_listing_id uuid,
  p_reviewer_user_id uuid,
  p_action text,
  p_review_notes text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_listing public.listing%rowtype;
begin
  if not exists (
    select 1 from public.app_user au
     where au.id = p_reviewer_user_id and (au.is_admin or au.is_owner)
  ) then
    raise exception 'admin or owner reviewer required' using errcode = '42501';
  end if;
  if p_action not in ('approve', 'needs_changes', 'reject')
     or char_length(coalesce(p_review_notes, '')) > 1000
     or (
       p_action in ('needs_changes', 'reject')
       and nullif(btrim(coalesce(p_review_notes, '')), '') is null
     ) then
    raise exception 'invalid listing review request' using errcode = '22023';
  end if;

  select * into v_listing
    from public.listing
   where id = p_listing_id
   for update;
  if not found then
    raise exception 'listing not found' using errcode = 'P0002';
  end if;
  if v_listing.source_type not in ('host_submitted', 'owner_seeded', 'claimed_host')
     or v_listing.lifecycle_status not in ('draft', 'pending_review', 'held') then
    raise exception 'listing is not reviewable in its current state' using errcode = '23514';
  end if;

  if p_action = 'approve' then
    update public.listing
       set lifecycle_status = 'active',
           visibility_status = 'public',
           moderation_status = 'clear',
           listing_verification_status = case
             when listing_verification_status = 'verified'
               then 'verified'::public.listing_verification_status
             else 'reviewed'::public.listing_verification_status
           end,
           review_notes_internal = nullif(btrim(coalesce(p_review_notes, '')), ''),
           review_notes = null,
           published_at = coalesce(published_at, clock_timestamp())
     where id = p_listing_id;
  elsif p_action = 'needs_changes' then
    update public.listing
       set lifecycle_status = 'held',
           visibility_status = 'private',
           moderation_status = 'held',
           review_notes_internal = btrim(p_review_notes),
           review_notes = btrim(p_review_notes)
     where id = p_listing_id;
  else
    update public.listing
       set lifecycle_status = 'rejected',
           visibility_status = 'private',
           moderation_status = 'rejected',
           review_notes_internal = btrim(p_review_notes),
           review_notes = btrim(p_review_notes)
     where id = p_listing_id;
  end if;

  insert into private.operator_audit_event (
    actor_user_id,
    action,
    target_type,
    target_id,
    previous_state,
    new_state,
    notes
  )
  select p_reviewer_user_id,
         'listing.' || p_action,
         'listing',
         p_listing_id,
         jsonb_build_object(
           'lifecycle_status', v_listing.lifecycle_status,
           'visibility_status', v_listing.visibility_status,
           'moderation_status', v_listing.moderation_status,
           'listing_verification_status', v_listing.listing_verification_status
         ),
         jsonb_build_object(
           'lifecycle_status', l.lifecycle_status,
           'visibility_status', l.visibility_status,
           'moderation_status', l.moderation_status,
           'listing_verification_status', l.listing_verification_status
         ),
         nullif(btrim(coalesce(p_review_notes, '')), '')
    from public.listing l
   where l.id = p_listing_id;

  select * into v_listing from public.listing where id = p_listing_id;
  return jsonb_build_object(
    'id', v_listing.id,
    'slug', v_listing.slug,
    'host_id', v_listing.host_id,
    'title', v_listing.title,
    'lifecycle_status', v_listing.lifecycle_status,
    'visibility_status', v_listing.visibility_status,
    'listing_verification_status', v_listing.listing_verification_status
  );
end;
$$;
revoke all on function public.review_canonical_listing(uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.review_canonical_listing(uuid, uuid, text, text)
  to service_role;

create function public.update_host_listing_draft(
  p_listing_id uuid,
  p_host_id uuid,
  p_payload jsonb,
  p_identity jsonb,
  p_tag_codes text[]
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_listing public.listing%rowtype;
  v_actor_user_id uuid;
  v_previous_lifecycle public.lifecycle_status;
  v_previous_moderation public.moderation_status;
  v_url_key text := nullif(p_identity ->> 'officialUrlKey', '');
  v_fingerprint text := nullif(p_identity ->> 'contentFingerprint', '');
  v_variant_key text := nullif(p_identity ->> 'variantKey', '');
  v_expected_variant text;
begin
  select h.app_user_id
    into v_actor_user_id
    from public.host h
   where h.id = p_host_id
     and h.account_status = 'active';
  if not found then
    raise exception 'active host required' using errcode = '42501';
  end if;

  select * into v_listing
    from public.listing
   where id = p_listing_id
     and host_id = p_host_id
   for update;
  if not found then
    raise exception 'host listing not found' using errcode = 'P0002';
  end if;
  if not (
    v_listing.lifecycle_status in ('draft', 'held', 'active', 'inactive')
    or v_listing.moderation_status = 'held'
  ) then
    raise exception 'listing cannot be edited in its current state' using errcode = '23514';
  end if;
  v_previous_lifecycle := v_listing.lifecycle_status;
  v_previous_moderation := v_listing.moderation_status;

  v_expected_variant := coalesce(nullif(left(p_payload ->> 'endDate', 10), ''), '?')
    || '|' || coalesce(nullif(lower(btrim(p_payload ->> 'eligibilityCountry')), ''), '?')
    || '|' || case
      when jsonb_typeof(p_payload -> 'eligibilityStates') = 'array' then coalesce(
        (select string_agg(normalized_state, ',' order by normalized_state)
           from (
             select distinct nullif(lower(btrim(state)), '') as normalized_state
               from jsonb_array_elements_text(p_payload -> 'eligibilityStates') as state
           ) states
          where normalized_state is not null),
        'none'
      )
      else '?'
    end;
  if v_fingerprint is null or v_variant_key is distinct from v_expected_variant then
    raise exception 'invalid listing identity' using errcode = '23514';
  end if;
  if coalesce((p_payload ->> 'noPurchaseNecessary')::boolean, false) is not true
     or coalesce(p_payload ->> 'entryUrl', '') !~ '^https?://'
     or coalesce(p_payload ->> 'officialRulesUrl', '') !~ '^https?://'
     or coalesce(p_payload ->> 'mainImageUrl', '') !~ '^https?://' then
    raise exception 'required listing trust fields are missing' using errcode = '23514';
  end if;
  if not exists (
    select 1 from public.category c
     where c.code = p_payload ->> 'prizeCategory' and c.is_active
  ) or exists (
    select 1
      from unnest(coalesce(p_tag_codes, '{}'::text[])) requested(code)
      left join public.tag t on t.code = requested.code and t.is_active
     where t.code is null
  ) then
    raise exception 'inactive category or tag' using errcode = '23514';
  end if;

  if v_url_key is not null then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('ingestion-url|' || v_url_key, 0)
    );
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'ingestion-content|' || v_fingerprint || '|' || v_variant_key,
      0
    )
  );
  if exists (
    select 1
      from public.listing_ingestion li
     where li.listing_id <> p_listing_id
       and li.variant_key = v_variant_key
       and (
         (v_url_key is not null and li.official_url_key = v_url_key)
         or li.content_fingerprint = v_fingerprint
       )
  ) then
    raise exception 'edited listing conflicts with an existing canonical identity'
      using errcode = '23505';
  end if;

  update public.listing
     set title = p_payload ->> 'title',
         short_description = p_payload ->> 'shortDescription',
         long_description = nullif(p_payload ->> 'longDescription', ''),
         prize_name = p_payload ->> 'prizeName',
         prize_value = nullif(p_payload ->> 'prizeValue', '')::numeric,
         prize_category = p_payload ->> 'prizeCategory',
         winner_count = nullif(p_payload ->> 'winnerCount', '')::integer,
         main_image_url = p_payload ->> 'mainImageUrl',
         image_source_type = 'external_reference',
         image_alt_text = nullif(p_payload ->> 'imageAltText', ''),
         entry_url = p_payload ->> 'entryUrl',
         official_rules_url = p_payload ->> 'officialRulesUrl',
         start_date = nullif(p_payload ->> 'startDate', '')::date,
         end_date = (p_payload ->> 'endDate')::date,
         entry_frequency = (p_payload ->> 'entryFrequency')::public.entry_frequency,
         entry_limit_notes = nullif(p_payload ->> 'entryLimitNotes', ''),
         eligibility_country = upper(p_payload ->> 'eligibilityCountry'),
         eligibility_states = case
           when jsonb_typeof(p_payload -> 'eligibilityStates') = 'array'
                and jsonb_array_length(p_payload -> 'eligibilityStates') > 0
             then array(select jsonb_array_elements_text(p_payload -> 'eligibilityStates'))
           else null
         end,
         age_requirement = (p_payload ->> 'ageRequirement')::integer,
         no_purchase_necessary = true,
         sponsor_name = p_payload ->> 'sponsorName',
         sponsor_url = nullif(p_payload ->> 'sponsorUrl', ''),
         lifecycle_status = 'draft',
         visibility_status = 'private',
         moderation_status = 'draft',
         listing_verification_status = 'unreviewed',
         published_at = null
   where id = p_listing_id
   returning * into v_listing;

  update public.listing_ingestion
     set official_url_key = v_url_key,
         content_fingerprint = v_fingerprint,
         variant_key = v_variant_key,
         official_source_url = p_payload ->> 'officialRulesUrl',
         content_hash = p_identity ->> 'contentHash',
         last_seen_at = clock_timestamp()
   where listing_id = p_listing_id;

  delete from public.listing_tag where listing_id = p_listing_id;
  insert into public.listing_tag (listing_id, tag_code)
  select p_listing_id, requested.code
    from (select distinct unnest(coalesce(p_tag_codes, '{}'::text[])) as code) requested;

  insert into private.operator_audit_event (
    actor_user_id, action, target_type, target_id, previous_state, new_state, notes
  ) values (
    v_actor_user_id,
    'listing.host_edit',
    'listing',
    p_listing_id,
    jsonb_build_object(
      'lifecycle_status', v_previous_lifecycle,
      'moderation_status', v_previous_moderation
    ),
    jsonb_build_object('lifecycle_status', 'draft', 'moderation_status', 'draft'),
    'Host updated material listing facts; re-review required.'
  );

  return jsonb_build_object('id', v_listing.id, 'slug', v_listing.slug);
end;
$$;
revoke all on function public.update_host_listing_draft(uuid, uuid, jsonb, jsonb, text[])
  from public, anon, authenticated;
grant execute on function public.update_host_listing_draft(uuid, uuid, jsonb, jsonb, text[])
  to service_role;

create function public.reactivate_host_listing(
  p_listing_id uuid,
  p_host_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_listing public.listing%rowtype;
  v_actor_user_id uuid;
begin
  select h.app_user_id
    into v_actor_user_id
    from public.host h
   where h.id = p_host_id
     and h.account_status = 'active';
  if not found then
    raise exception 'active host required' using errcode = '42501';
  end if;

  select * into v_listing
    from public.listing
   where id = p_listing_id
     and host_id = p_host_id
   for update;
  if not found then raise exception 'host listing not found' using errcode = 'P0002'; end if;
  if v_listing.lifecycle_status <> 'inactive'
     or v_listing.visibility_status <> 'unlisted'
     or v_listing.end_date < current_date
     or v_listing.listing_verification_status not in ('reviewed', 'verified')
     or v_listing.moderation_status <> 'clear'
     or v_listing.duplicate_status <> 'clear' then
    raise exception 'listing is not eligible for reactivation' using errcode = '23514';
  end if;

  update public.listing
     set lifecycle_status = 'active',
         visibility_status = 'public',
         review_notes = case
           when review_notes = 'Paused automatically because the host listing allowance decreased.'
             then null
           else review_notes
         end,
         published_at = coalesce(published_at, clock_timestamp())
   where id = p_listing_id
   returning * into v_listing;

  insert into private.operator_audit_event (
    actor_user_id, action, target_type, target_id, previous_state, new_state, notes
  ) values (
    v_actor_user_id,
    'listing.host_reactivate',
    'listing',
    p_listing_id,
    jsonb_build_object('lifecycle_status', 'inactive', 'visibility_status', 'unlisted'),
    jsonb_build_object('lifecycle_status', 'active', 'visibility_status', 'public'),
    'Host reactivated a previously reviewed listing within current capacity.'
  );
  return jsonb_build_object('id', v_listing.id, 'slug', v_listing.slug);
end;
$$;
revoke all on function public.reactivate_host_listing(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.reactivate_host_listing(uuid, uuid)
  to service_role;

create function public.update_seeker_state_atomic(
  p_app_user_id uuid,
  p_listing_id uuid,
  p_primary_ui_state text,
  p_saved boolean,
  p_viewed boolean
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_state public.listing_seeker_state%rowtype;
  v_primary public.seeker_ui_state;
  v_now timestamptz := clock_timestamp();
begin
  if not exists (select 1 from public.app_user where id = p_app_user_id)
     or not exists (select 1 from public.listing where id = p_listing_id) then
    raise exception 'invalid seeker state identity' using errcode = '23503';
  end if;
  if p_primary_ui_state is not null then
    begin
      v_primary := p_primary_ui_state::public.seeker_ui_state;
    exception when invalid_text_representation then
      raise exception 'invalid seeker state' using errcode = '22023';
    end;
  end if;
  if v_primary = 'won' and not exists (
    select 1
      from public.listing_seeker_state state
     where state.app_user_id = p_app_user_id
       and state.listing_id = p_listing_id
       and state.entered_at is not null
  ) then
    raise exception 'a win requires a prior entered transition' using errcode = '23514';
  end if;

  insert into public.listing_seeker_state (
    app_user_id,
    listing_id,
    viewed_at,
    saved_at,
    is_saved,
    entered_at,
    skipped_at,
    won_at,
    primary_ui_state
  ) values (
    p_app_user_id,
    p_listing_id,
    case when p_viewed then v_now else null end,
    case when p_saved = true or v_primary = 'saved' then v_now else null end,
    coalesce(p_saved, false) or coalesce(v_primary = 'saved', false),
    case when v_primary = 'entered' then v_now else null end,
    case when v_primary = 'skipped' then v_now else null end,
    case when v_primary = 'won' then v_now else null end,
    coalesce(v_primary, 'none'::public.seeker_ui_state)
  )
  on conflict (app_user_id, listing_id) do update set
    viewed_at = case when p_viewed then v_now else public.listing_seeker_state.viewed_at end,
    saved_at = case
      when p_saved = true or v_primary = 'saved' then v_now
      else public.listing_seeker_state.saved_at
    end,
    is_saved = case
      when p_saved is not null then p_saved
      when v_primary = 'saved' then true
      else public.listing_seeker_state.is_saved
    end,
    entered_at = case when v_primary = 'entered' then v_now else public.listing_seeker_state.entered_at end,
    skipped_at = case when v_primary = 'skipped' then v_now else public.listing_seeker_state.skipped_at end,
    won_at = case when v_primary = 'won' then v_now else public.listing_seeker_state.won_at end,
    primary_ui_state = coalesce(v_primary, public.listing_seeker_state.primary_ui_state)
  returning * into v_state;

  if v_primary = 'entered' then
    insert into public.seeker_entry_event (app_user_id, listing_id)
    values (p_app_user_id, p_listing_id)
    on conflict (app_user_id, listing_id, entered_on) do nothing;
  end if;

  return to_jsonb(v_state);
end;
$$;
revoke all on function public.update_seeker_state_atomic(uuid, uuid, text, boolean, boolean)
  from public, anon, authenticated;
grant execute on function public.update_seeker_state_atomic(uuid, uuid, text, boolean, boolean)
  to service_role;
revoke insert, update, delete on public.listing_seeker_state from authenticated;
revoke insert, update, delete on public.seeker_entry_event from authenticated;
grant select, insert, update, delete on public.listing_seeker_state to service_role;
grant select, insert, update, delete on public.seeker_entry_event to service_role;

create table private.rate_limit_bucket (
  bucket_key text primary key,
  window_started_at timestamptz not null,
  hit_count integer not null check (hit_count > 0),
  updated_at timestamptz not null default now()
);
revoke all on private.rate_limit_bucket from public, anon, authenticated, service_role;

create function public.consume_rate_limit(
  p_bucket_key text,
  p_limit integer,
  p_window_seconds integer
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bucket private.rate_limit_bucket%rowtype;
  v_now timestamptz := clock_timestamp();
  v_retry integer;
begin
  if nullif(btrim(p_bucket_key), '') is null
     or char_length(p_bucket_key) > 160
     or p_limit < 1 or p_limit > 10000
     or p_window_seconds < 1 or p_window_seconds > 86400 then
    raise exception 'invalid rate limit request' using errcode = '22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('rate-limit|' || p_bucket_key, 0)
  );
  select * into v_bucket
    from private.rate_limit_bucket
   where bucket_key = p_bucket_key
   for update;

  if not found or v_bucket.window_started_at + make_interval(secs => p_window_seconds) <= v_now then
    insert into private.rate_limit_bucket (bucket_key, window_started_at, hit_count, updated_at)
    values (p_bucket_key, v_now, 1, v_now)
    on conflict (bucket_key) do update set
      window_started_at = excluded.window_started_at,
      hit_count = 1,
      updated_at = excluded.updated_at;
    return jsonb_build_object('ok', true, 'retry_after_sec', 0);
  end if;

  if v_bucket.hit_count >= p_limit then
    v_retry := greatest(
      1,
      ceil(extract(epoch from (
        v_bucket.window_started_at + make_interval(secs => p_window_seconds) - v_now
      )))::integer
    );
    return jsonb_build_object('ok', false, 'retry_after_sec', v_retry);
  end if;

  update private.rate_limit_bucket
     set hit_count = hit_count + 1,
         updated_at = v_now
   where bucket_key = p_bucket_key;
  return jsonb_build_object('ok', true, 'retry_after_sec', 0);
end;
$$;
revoke all on function public.consume_rate_limit(text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.consume_rate_limit(text, integer, integer)
  to service_role;

alter table public.report
  add column reviewed_by uuid references public.app_user(id) on delete set null,
  add column review_notes text,
  add column resolution_code text,
  add constraint report_review_notes_len check (
    review_notes is null or char_length(review_notes) <= 2000
  );
create unique index report_one_open_equivalent_uidx
  on public.report (reporter_user_id, target_type, target_id, reason_code)
  where status in ('submitted', 'ai_triage', 'admin_review', 'escalated');

create function public.create_validated_report(
  p_reporter_user_id uuid,
  p_target_type public.report_target_type,
  p_target_id uuid,
  p_reason_code public.report_reason,
  p_details text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_report public.report%rowtype;
begin
  if not exists (select 1 from public.app_user where id = p_reporter_user_id)
     or char_length(coalesce(p_details, '')) > 500 then
    raise exception 'invalid report submission' using errcode = '22023';
  end if;
  if p_target_type in ('listing', 'image', 'entry_link') then
    if not exists (select 1 from public.listing where id = p_target_id) then
      raise exception 'reported listing target does not exist' using errcode = '23503';
    end if;
  elsif p_target_type = 'host' then
    if not exists (select 1 from public.host where id = p_target_id) then
      raise exception 'reported host target does not exist' using errcode = '23503';
    end if;
  elsif p_target_type = 'winner_post' then
    if not exists (select 1 from public.winner_post where id = p_target_id) then
      raise exception 'reported winner target does not exist' using errcode = '23503';
    end if;
  end if;

  begin
    insert into public.report (
      reporter_user_id, target_type, target_id, reason_code, details, status
    ) values (
      p_reporter_user_id, p_target_type, p_target_id, p_reason_code,
      nullif(btrim(coalesce(p_details, '')), ''), 'submitted'
    ) returning * into v_report;
    return jsonb_build_object('id', v_report.id, 'status', v_report.status, 'created', true);
  exception when unique_violation then
    select * into v_report
      from public.report
     where reporter_user_id = p_reporter_user_id
       and target_type = p_target_type
       and target_id = p_target_id
       and reason_code = p_reason_code
       and status in ('submitted', 'ai_triage', 'admin_review', 'escalated')
     order by created_at
     limit 1;
    return jsonb_build_object('id', v_report.id, 'status', v_report.status, 'created', false);
  end;
end;
$$;
revoke all on function public.create_validated_report(uuid, public.report_target_type, uuid, public.report_reason, text)
  from public, anon, authenticated;
grant execute on function public.create_validated_report(uuid, public.report_target_type, uuid, public.report_reason, text)
  to service_role;

create function public.resolve_content_report(
  p_report_id uuid,
  p_reviewer_user_id uuid,
  p_action text,
  p_review_notes text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_report public.report%rowtype;
begin
  if not exists (
    select 1 from public.app_user au
     where au.id = p_reviewer_user_id and (au.is_admin or au.is_owner)
  ) then
    raise exception 'admin or owner reviewer required' using errcode = '42501';
  end if;
  if p_action not in ('dismiss', 'act')
     or nullif(btrim(coalesce(p_review_notes, '')), '') is null
     or char_length(p_review_notes) > 2000 then
    raise exception 'valid report decision and notes are required' using errcode = '22023';
  end if;
  select * into v_report
    from public.report
   where id = p_report_id
   for update;
  if not found then
    raise exception 'report not found' using errcode = 'P0002';
  end if;
  if v_report.status not in ('submitted', 'ai_triage', 'admin_review', 'escalated') then
    raise exception 'report is already resolved' using errcode = '23514';
  end if;

  if p_action = 'act' then
    if v_report.target_type in ('listing', 'image', 'entry_link') then
      update public.listing
         set lifecycle_status = 'held',
             visibility_status = 'private',
             moderation_status = 'held',
             review_notes = btrim(p_review_notes),
             review_notes_internal = btrim(p_review_notes)
       where id = v_report.target_id;
      if not found then raise exception 'report target disappeared' using errcode = 'P0002'; end if;
    elsif v_report.target_type = 'winner_post' then
      update public.winner_post
         set review_status = 'hidden', verified_win = false,
             reviewed_by = p_reviewer_user_id, reviewed_at = clock_timestamp(),
             review_notes = btrim(p_review_notes)
       where id = v_report.target_id;
      if not found then raise exception 'report target disappeared' using errcode = 'P0002'; end if;
    elsif v_report.target_type = 'host' then
      perform public.moderate_host(
        v_report.target_id,
        p_reviewer_user_id,
        'suspend',
        p_review_notes,
        null
      );
    end if;
  end if;

  update public.report
     set status = case when p_action = 'act'
       then 'action_taken'::public.report_status else 'dismissed'::public.report_status end,
         reviewed_by = p_reviewer_user_id,
         review_notes = btrim(p_review_notes),
         resolution_code = case when p_action = 'act'
           then 'target_restricted' else 'no_violation' end,
         resolved_at = clock_timestamp()
   where id = p_report_id;

  insert into private.operator_audit_event (
    actor_user_id, action, target_type, target_id, previous_state, new_state, notes
  ) values (
    p_reviewer_user_id,
    'report.' || p_action,
    'report',
    p_report_id,
    jsonb_build_object('status', v_report.status),
    jsonb_build_object('status', case when p_action = 'act' then 'action_taken' else 'dismissed' end),
    btrim(p_review_notes)
  );
  return jsonb_build_object(
    'report_id', p_report_id,
    'status', case when p_action = 'act' then 'action_taken' else 'dismissed' end,
    'target_type', v_report.target_type,
    'target_id', v_report.target_id
  );
end;
$$;
revoke all on function public.resolve_content_report(uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.resolve_content_report(uuid, uuid, text, text)
  to service_role;

drop trigger if exists trg_apply_listing_claim on public.listing_claim;
alter table public.listing_claim
  add column authority_basis text,
  add column authority_evidence text,
  add column authority_evidence_url text,
  add column authority_attested boolean not null default false,
  add column review_notes text,
  add constraint listing_claim_authority_basis_len check (
    authority_basis is null or char_length(authority_basis) <= 120
  ),
  add constraint listing_claim_authority_evidence_len check (
    authority_evidence is null or char_length(authority_evidence) <= 2000
  ),
  add constraint listing_claim_evidence_url_https check (
    authority_evidence_url is null or authority_evidence_url ~ '^https://[^[:space:]]+$'
  ),
  add constraint listing_claim_review_notes_len check (
    review_notes is null or char_length(review_notes) <= 2000
  );
create unique index listing_claim_one_approved_uidx
  on public.listing_claim (listing_id)
  where status = 'approved';

create function public.create_listing_claim_request(
  p_listing_id uuid,
  p_host_id uuid,
  p_authority_basis text,
  p_authority_evidence text,
  p_authority_evidence_url text,
  p_authority_attested boolean
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_claim public.listing_claim%rowtype;
begin
  if nullif(btrim(coalesce(p_authority_basis, '')), '') is null
     or char_length(p_authority_basis) > 120
     or char_length(btrim(coalesce(p_authority_evidence, ''))) < 20
     or char_length(p_authority_evidence) > 2000
     or p_authority_attested is distinct from true
     or (
       p_authority_evidence_url is not null
       and p_authority_evidence_url !~ '^https://[^[:space:]]+$'
     ) then
    raise exception 'complete claim authority evidence is required' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.host h
     where h.id = p_host_id
       and h.account_status = 'active'
       and h.verification_status = 'admin_verified'
  ) then
    raise exception 'verified active host required' using errcode = '42501';
  end if;
  perform 1 from public.listing l
   where l.id = p_listing_id
     and l.host_id is null
     and l.source_type = 'owner_seeded'
   for update;
  if not found then
    raise exception 'listing is not claimable' using errcode = '23514';
  end if;

  begin
    insert into public.listing_claim (
      listing_id, requesting_host_id, status, authority_basis,
      authority_evidence, authority_evidence_url, authority_attested
    ) values (
      p_listing_id, p_host_id, 'requested', btrim(p_authority_basis),
      btrim(p_authority_evidence), p_authority_evidence_url, true
    ) returning * into v_claim;
  exception when unique_violation then
    raise exception 'an open or approved claim already exists' using errcode = '23505';
  end;
  return jsonb_build_object('id', v_claim.id, 'status', v_claim.status);
end;
$$;
revoke all on function public.create_listing_claim_request(uuid, uuid, text, text, text, boolean)
  from public, anon, authenticated;
grant execute on function public.create_listing_claim_request(uuid, uuid, text, text, text, boolean)
  to service_role;

create function public.review_listing_claim(
  p_claim_id uuid,
  p_reviewer_user_id uuid,
  p_action text,
  p_review_notes text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_claim public.listing_claim%rowtype;
begin
  if not exists (
    select 1 from public.app_user au
     where au.id = p_reviewer_user_id and (au.is_admin or au.is_owner)
  ) then
    raise exception 'admin or owner reviewer required' using errcode = '42501';
  end if;
  if p_action not in ('approve', 'reject')
     or nullif(btrim(coalesce(p_review_notes, '')), '') is null
     or char_length(p_review_notes) > 2000 then
    raise exception 'valid claim decision and notes are required' using errcode = '22023';
  end if;
  select * into v_claim
    from public.listing_claim
   where id = p_claim_id
   for update;
  if not found then raise exception 'claim not found' using errcode = 'P0002'; end if;
  if v_claim.status <> 'requested' then
    raise exception 'claim is already resolved' using errcode = '23514';
  end if;

  if p_action = 'approve' then
    if not exists (
      select 1 from public.host h
       where h.id = v_claim.requesting_host_id
         and h.account_status = 'active'
         and h.verification_status = 'admin_verified'
    ) then
      raise exception 'requesting host is no longer verified and active' using errcode = '23514';
    end if;
    update public.listing
       set host_id = v_claim.requesting_host_id,
           source_type = 'claimed_host',
           public_source_label = 'claimed_by_host'
     where id = v_claim.listing_id
       and host_id is null
       and source_type = 'owner_seeded';
    if not found then raise exception 'listing is no longer claimable' using errcode = '23514'; end if;
  end if;

  update public.listing_claim
     set status = case when p_action = 'approve'
       then 'approved'::public.claim_status else 'rejected'::public.claim_status end,
         reviewed_by = p_reviewer_user_id,
         reviewed_at = clock_timestamp(),
         review_notes = btrim(p_review_notes)
   where id = p_claim_id;

  insert into private.operator_audit_event (
    actor_user_id, action, target_type, target_id, previous_state, new_state, notes, evidence_url
  ) values (
    p_reviewer_user_id,
    'listing_claim.' || p_action,
    'listing_claim',
    p_claim_id,
    jsonb_build_object('status', 'requested'),
    jsonb_build_object('status', case when p_action = 'approve' then 'approved' else 'rejected' end),
    btrim(p_review_notes),
    v_claim.authority_evidence_url
  );
  return jsonb_build_object(
    'claim_id', p_claim_id,
    'listing_id', v_claim.listing_id,
    'status', case when p_action = 'approve' then 'approved' else 'rejected' end
  );
end;
$$;
revoke all on function public.review_listing_claim(uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.review_listing_claim(uuid, uuid, text, text)
  to service_role;
