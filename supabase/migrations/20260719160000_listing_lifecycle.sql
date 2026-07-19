-- Listing lifecycle integrity — the persistent substrate for re-verification
-- scheduling, changed-page auditing, dead-link tracking, and explainable
-- deduplication (lib/ingestion/lifecycle.ts, lib/ingestion/fingerprint.ts).
--
-- All additive. No lifecycle transition runs on apply — these columns and
-- tables give the (still-gated) re-verification pass somewhere to record its
-- reasoning, and give the admin review queue the evidence to act on. Nothing
-- here publishes, hides, or mutates a live listing by itself.

-- A sponsor may reuse one official URL for a later annual cycle or regional
-- variant. URL-only uniqueness would collapse that new sweep before review.
alter table public.listing_ingestion
  add column variant_key text;

update public.listing_ingestion as ingestion
   set variant_key = coalesce(listing.end_date::text, '?')
     || '|' || coalesce(nullif(lower(btrim(listing.eligibility_country)), ''), '?')
     || '|' || case
       when listing.eligibility_states is null
         then '?'
       when cardinality(listing.eligibility_states) = 0
         then 'none'
       else coalesce(
         (select string_agg(normalized_state, ',' order by normalized_state)
            from (
              select distinct nullif(lower(btrim(state)), '') as normalized_state
                from unnest(listing.eligibility_states) as state
            ) states
           where normalized_state is not null),
         'none'
       )
     end
  from public.listing
 where listing.id = ingestion.listing_id;

alter table public.listing_ingestion
  alter column variant_key set not null,
  drop constraint if exists listing_ingestion_official_url_key_key;

create unique index listing_ingestion_official_variant_uidx
  on public.listing_ingestion (official_url_key, variant_key)
  where official_url_key is not null;

-- The legacy content hash remains stable. It is an explainable candidate
-- signal, not conclusive identity: a 32-bit collision or legitimately distinct
-- promotion must never be silently collapsed.
drop index if exists public.listing_ingestion_content_fingerprint_uidx;
create index listing_ingestion_content_variant_idx
  on public.listing_ingestion (content_fingerprint, variant_key);

-- Re-verification bookkeeping lives on listing_ingestion (1:1 with listing,
-- already the home of provenance) so it stays off the canonical listing object.
alter table listing_ingestion
  add column last_verified_at timestamptz,
  add column next_verify_due_at timestamptz,
  add column verify_priority int not null default 0
    check (verify_priority between 0 and 100),
  add column verify_reasons jsonb not null default '[]'::jsonb
    check (jsonb_typeof(verify_reasons) = 'array'),
  add column consecutive_fetch_failures int not null default 0
    check (consecutive_fetch_failures >= 0),
  -- null = healthy; 'suspected' = failing, under retry; 'confirmed' = dead.
  add column dead_link_status text
    check (dead_link_status is null or dead_link_status in ('suspected', 'confirmed')),
  add column last_fetch_failure_class text;

comment on column listing_ingestion.next_verify_due_at is
  'When lib/ingestion/lifecycle.planReverification says this listing is next due for a source re-check. Risk-based, not a global interval.';
comment on column listing_ingestion.dead_link_status is
  'null (healthy) | suspected (transient/unconfirmed) | confirmed (404/410 twice). Confirmed links are eligible for a separate suppression/review transition; this migration does not change public visibility.';

create index listing_ingestion_verify_due_idx
  on listing_ingestion (next_verify_due_at) where next_verify_due_at is not null;

-- Append-only audit of every meaningful change detected at a source. A verified
-- listing is never silently overwritten (lib/ingestion/lifecycle.assessChange);
-- the intended change is recorded here for a reviewer, with the old and new
-- values preserved as evidence.
create table listing_change_event (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references listing(id) on delete cascade,
  field text not null,                      -- MaterialFacts key, or 'closed'/'disappeared'
  old_value text,
  new_value text,
  material boolean not null default false,
  disposition text not null
    check (disposition in ('changed_minor','changed_material','closed','disappeared')),
  overwrite_allowed boolean not null default false,
  detected_at timestamptz not null default now()
);
create index listing_change_event_listing_idx
  on listing_change_event (listing_id, detected_at desc);

-- Explainable duplicate candidates. Distinct regional/recurring sweepstakes are
-- deliberately NOT collapsed; a suspected pair is recorded with the matched
-- signals so a reviewer can confirm or dismiss. duplicate_status on the listing
-- itself remains the authoritative resolution.
create table listing_duplicate_candidate (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references listing(id) on delete cascade,
  other_listing_id uuid not null references listing(id) on delete cascade,
  verdict text not null check (verdict in ('identical', 'suspected')),
  strength numeric not null default 0 check (strength between 0 and 1),
  signals jsonb not null default '[]'::jsonb check (jsonb_typeof(signals) = 'array'),
  resolved boolean not null default false,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  -- One open candidate row per unordered pair; resolution flips `resolved`.
  unique (listing_id, other_listing_id),
  check (listing_id < other_listing_id)
);
create index listing_duplicate_candidate_open_idx
  on listing_duplicate_candidate (listing_id) where resolved = false;

-- Append-only guarantee for the change audit. Use the trigger's actual table
-- name so an attempted mutation produces actionable operator evidence.
create function private.reject_append_only_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception '%.% is append-only', tg_table_schema, tg_table_name;
end;
$$;
revoke execute on function private.reject_append_only_mutation()
  from public, anon, authenticated, service_role;

create trigger listing_change_event_no_update
  before update or delete on listing_change_event
  for each row execute function private.reject_append_only_mutation();

-- Internal operational data: admin/owner read only; writes via service role.
alter table listing_change_event enable row level security;
create policy listing_change_event_admin_read on listing_change_event for select
  using (private.is_admin() or private.is_owner());
revoke all on table listing_change_event from anon, authenticated, service_role;
grant select on listing_change_event to authenticated;
grant insert on listing_change_event to service_role;

alter table listing_duplicate_candidate enable row level security;
create policy listing_duplicate_candidate_admin_read on listing_duplicate_candidate for select
  using (private.is_admin() or private.is_owner());
revoke all on table listing_duplicate_candidate from anon, authenticated, service_role;
grant select on listing_duplicate_candidate to authenticated;
grant select, insert, update on listing_duplicate_candidate to service_role;
grant select, update on listing_ingestion to service_role;

-- Replace URL-only claiming with URL + cycle/region identity. The global
-- content fingerprint still catches the same sweep discovered through another
-- URL, while a reused official URL can create a distinct private draft when
-- its end date or region discriminator changes.
create or replace function public.create_ingested_listing_with_provenance(
  p_candidate jsonb,
  p_provenance jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_listing_id uuid;
  v_existing_id uuid;
  v_url_existing_id uuid;
  v_fingerprint_existing_id uuid;
  v_suspected_duplicate_ids jsonb := '[]'::jsonb;
  v_url_key text := nullif(p_provenance ->> 'officialUrlKey', '');
  v_fingerprint text := nullif(p_provenance ->> 'contentFingerprint', '');
  v_variant_key text;
  v_supplied_variant_key text := nullif(p_provenance ->> 'variantKey', '');
  v_slug_base text;
  v_slug text;
begin
  if v_fingerprint is null then
    raise exception 'contentFingerprint is required' using errcode = '23514';
  end if;
  -- The database is authoritative for identity. Derive the discriminator from
  -- the exact candidate values it will persist; accept an omitted key for an
  -- in-flight old app version, but reject any supplied stale/forged mismatch.
  v_variant_key := coalesce(nullif(left(p_candidate ->> 'endDate', 10), ''), '?')
    || '|' || coalesce(nullif(lower(btrim(p_candidate ->> 'eligibilityCountry')), ''), '?')
    || '|' || case
      when jsonb_typeof(p_candidate -> 'eligibilityStates') = 'array' then coalesce(
        (select string_agg(normalized_state, ',' order by normalized_state)
           from (
             select distinct nullif(lower(btrim(state)), '') as normalized_state
               from jsonb_array_elements_text(p_candidate -> 'eligibilityStates') as state
           ) states
          where normalized_state is not null),
        'none'
      )
      else '?'
    end;

  if v_supplied_variant_key is not null and v_supplied_variant_key <> v_variant_key then
    raise exception 'variantKey does not match candidate: expected %, received %',
      v_variant_key, v_supplied_variant_key using errcode = '23514';
  end if;

  -- Stable lock order: URL first, then content. The URL lock serializes
  -- unknown-to-known enrichment variants that deliberately have different
  -- fingerprints/variant keys; the content lock serializes cross-URL matches.
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

  select listing_id
    into v_url_existing_id
    from public.listing_ingestion
   where v_url_key is not null
     and official_url_key = v_url_key
     and variant_key = v_variant_key;

  select listing_id
    into v_fingerprint_existing_id
    from public.listing_ingestion
   where content_fingerprint = v_fingerprint
     and variant_key = v_variant_key
   order by first_ingested_at, listing_id
   limit 1;

  -- URL+variant is authoritative when present. For URL-less candidates only,
  -- the legacy content+variant signal remains fallback idempotency.
  v_existing_id := case
    when v_url_key is null then v_fingerprint_existing_id
    else v_url_existing_id
  end;
  if v_existing_id is not null then
    update public.listing_ingestion
       set last_seen_at = clock_timestamp()
     where listing_id = v_existing_id;
    return jsonb_build_object(
      'listing_id', v_existing_id,
      'created', false,
      'suspected_duplicate_ids', '[]'::jsonb
    );
  end if;

  v_slug_base := trim(both '-' from lower(regexp_replace(
    coalesce(nullif(p_candidate ->> 'title', ''), nullif(p_candidate ->> 'prizeName', ''), 'sweep'),
    '[^a-z0-9]+', '-', 'g'
  )));
  v_slug := left(coalesce(nullif(v_slug_base, ''), 'sweep'), 55)
    || '-' || left(pg_catalog.gen_random_uuid()::text, 8);

  begin
    insert into public.listing (
      slug, title, short_description, long_description, prize_name,
      prize_value, prize_currency, prize_category, main_image_url,
      image_source_type, image_alt_text, entry_url, official_rules_url,
      start_date, end_date, entry_frequency, eligibility_country,
      eligibility_states, age_requirement, no_purchase_necessary,
      source_type, public_source_label, created_by_role, sponsor_name,
      sponsor_url, lifecycle_status, visibility_status,
      listing_verification_status
    ) values (
      v_slug,
      p_candidate ->> 'title',
      p_candidate ->> 'shortDescription',
      p_candidate ->> 'longDescription',
      p_candidate ->> 'prizeName',
      (p_candidate ->> 'prizeValue')::numeric,
      'USD',
      p_candidate ->> 'prizeCategory',
      p_candidate ->> 'mainImageUrl',
      case when nullif(p_candidate ->> 'mainImageUrl', '') is null
        then null else 'external_reference'::public.image_source_type end,
      p_candidate ->> 'imageAltText',
      p_candidate ->> 'entryUrl',
      p_candidate ->> 'officialRulesUrl',
      (p_candidate ->> 'startDate')::date,
      (p_candidate ->> 'endDate')::date,
      (p_candidate ->> 'entryFrequency')::public.entry_frequency,
      p_candidate ->> 'eligibilityCountry',
      case when jsonb_typeof(p_candidate -> 'eligibilityStates') = 'array' then
        case when jsonb_array_length(p_candidate -> 'eligibilityStates') = 0
          then null
          else array(select jsonb_array_elements_text(p_candidate -> 'eligibilityStates'))
        end
      else null end,
      (p_candidate ->> 'ageRequirement')::integer,
      (p_candidate ->> 'noPurchaseNecessary')::boolean,
      'owner_seeded'::public.source_type,
      'found_by_sweepza'::public.source_label,
      'system'::public.created_by_role,
      p_candidate ->> 'sponsorName',
      p_candidate ->> 'sponsorUrl',
      'draft'::public.lifecycle_status,
      'private'::public.visibility_status,
      'unreviewed'::public.listing_verification_status
    ) returning id into v_listing_id;

    insert into public.listing_ingestion (
      listing_id, official_url_key, content_fingerprint, variant_key,
      discovery_source, official_source_url, extraction_confidence,
      extraction_factors, extraction_summary, content_hash
    ) values (
      v_listing_id,
      v_url_key,
      v_fingerprint,
      v_variant_key,
      p_provenance ->> 'discoverySource',
      p_provenance ->> 'officialSourceUrl',
      (p_provenance ->> 'extractionConfidence')::numeric,
      case when jsonb_typeof(p_provenance -> 'extractionFactors') = 'null'
        then null else p_provenance -> 'extractionFactors' end,
      p_provenance ->> 'extractionSummary',
      p_provenance ->> 'contentHash'
    );

    -- A cross-URL content match, or the same URL becoming more specific where
    -- an old discriminator was unknown, is only suspected. Keep both drafts
    -- private and preserve evidence for a reviewer.
    with candidates as (
      select existing.listing_id,
             case
               when existing.content_fingerprint = v_fingerprint
                    and existing.variant_key = v_variant_key
                 then 'same_content_fingerprint'
               else 'same_official_url_incomplete_variant'
             end as signal_id
        from public.listing_ingestion existing
       where existing.listing_id <> v_listing_id
         and (
           (existing.content_fingerprint = v_fingerprint
            and existing.variant_key = v_variant_key)
           or
           (v_url_key is not null
            and existing.official_url_key = v_url_key
            and (split_part(existing.variant_key, '|', 1) = split_part(v_variant_key, '|', 1)
                 or split_part(existing.variant_key, '|', 1) = '?'
                 or split_part(v_variant_key, '|', 1) = '?')
            and (split_part(existing.variant_key, '|', 2) = split_part(v_variant_key, '|', 2)
                 or split_part(existing.variant_key, '|', 2) = '?'
                 or split_part(v_variant_key, '|', 2) = '?')
            and (split_part(existing.variant_key, '|', 3) = split_part(v_variant_key, '|', 3)
                 or split_part(existing.variant_key, '|', 3) = '?'
                 or split_part(v_variant_key, '|', 3) = '?'))
         )
    ), inserted as (
      insert into public.listing_duplicate_candidate (
        listing_id, other_listing_id, verdict, strength, signals
      )
      select least(v_listing_id, candidate.listing_id),
             greatest(v_listing_id, candidate.listing_id),
             'suspected',
             0.5,
             jsonb_build_array(
               jsonb_build_object(
                 'id', candidate.signal_id,
                 'matched', true,
                 'detail', case candidate.signal_id
                   when 'same_content_fingerprint'
                     then '32-bit content signal matched; compare source facts before resolving'
                   else 'same official URL with compatible unknown-to-known cycle or region; compare before resolving'
                 end
               )
             )
        from candidates candidate
      on conflict (listing_id, other_listing_id) do update
        set verdict = excluded.verdict,
            strength = excluded.strength,
            signals = excluded.signals,
            last_seen_at = clock_timestamp()
      returning case
        when listing_id = v_listing_id then other_listing_id
        else listing_id
      end as duplicate_id
    )
    select coalesce(jsonb_agg(duplicate_id), '[]'::jsonb)
      into v_suspected_duplicate_ids
      from inserted;

    if jsonb_array_length(v_suspected_duplicate_ids) > 0 then
      update public.listing
         set duplicate_status = 'suspected'
       where (id = v_listing_id
              or id in (select jsonb_array_elements_text(v_suspected_duplicate_ids)::uuid))
         and duplicate_status = 'clear';
    end if;

    return jsonb_build_object(
      'listing_id', v_listing_id,
      'created', true,
      'suspected_duplicate_ids', v_suspected_duplicate_ids
    );
  exception when unique_violation then
    select listing_id
      into v_url_existing_id
      from public.listing_ingestion
     where v_url_key is not null
       and official_url_key = v_url_key
       and variant_key = v_variant_key;

    select listing_id
      into v_fingerprint_existing_id
      from public.listing_ingestion
     where content_fingerprint = v_fingerprint
       and variant_key = v_variant_key
     order by first_ingested_at, listing_id
     limit 1;

    v_existing_id := case
      when v_url_key is null then v_fingerprint_existing_id
      else v_url_existing_id
    end;
    if v_existing_id is not null then
      update public.listing_ingestion
         set last_seen_at = clock_timestamp()
       where listing_id = v_existing_id;
      return jsonb_build_object(
        'listing_id', v_existing_id,
        'created', false,
        'suspected_duplicate_ids', '[]'::jsonb
      );
    end if;
    raise;
  end;
end;
$$;

comment on function public.create_ingested_listing_with_provenance(jsonb, jsonb) is
  'Atomically claims URL + cycle/region identity; cross-URL content matches remain private suspected-duplicate drafts for review.';
