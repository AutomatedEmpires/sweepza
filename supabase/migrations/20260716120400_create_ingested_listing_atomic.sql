-- Claim an ingestion identity and create its private draft + provenance in one
-- transaction. Separate client-side inserts allowed overlapping cron runs to
-- create two listings before either unique provenance row existed; a failed
-- provenance write also stranded an orphan draft. The unique URL and content
-- identities plus this function make both cases atomic.

-- 20260714140000 is already in deployed migration history, so changing that
-- old file would only fix clean replays. Establish the fallback identity on the
-- real upgrade path too, and fail loudly before the index build if historical
-- duplicates need an explicit operator decision.
do $$
declare
  v_duplicate text;
begin
  select content_fingerprint
    into v_duplicate
    from public.listing_ingestion
   group by content_fingerprint
  having count(*) > 1
   limit 1;

  if found then
    raise exception 'cannot enforce unique ingestion fingerprint; duplicate exists: %', v_duplicate;
  end if;
end;
$$;

create unique index listing_ingestion_content_fingerprint_uidx
  on public.listing_ingestion (content_fingerprint);
drop index if exists public.listing_ingestion_fingerprint_idx;

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
  v_url_key text := nullif(p_provenance ->> 'officialUrlKey', '');
  v_fingerprint text := nullif(p_provenance ->> 'contentFingerprint', '');
  v_slug_base text;
  v_slug text;
begin
  if v_fingerprint is null then
    raise exception 'contentFingerprint is required' using errcode = '23514';
  end if;

  select listing_id
    into v_existing_id
    from public.listing_ingestion
   where (v_url_key is not null and official_url_key = v_url_key)
      or content_fingerprint = v_fingerprint
   limit 1;

  if found then
    update public.listing_ingestion
       set last_seen_at = clock_timestamp()
     where listing_id = v_existing_id;
    return jsonb_build_object('listing_id', v_existing_id, 'created', false);
  end if;

  v_slug_base := trim(both '-' from lower(regexp_replace(
    coalesce(nullif(p_candidate ->> 'title', ''), nullif(p_candidate ->> 'prizeName', ''), 'sweep'),
    '[^a-z0-9]+', '-', 'g'
  )));
  v_slug := left(coalesce(nullif(v_slug_base, ''), 'sweep'), 55)
    || '-' || left(pg_catalog.gen_random_uuid()::text, 8);

  -- The exception block is a subtransaction. If either insert conflicts or
  -- fails, PostgreSQL rolls both back before we resolve the winning identity.
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
      case when jsonb_array_length(coalesce(p_candidate -> 'eligibilityStates', '[]'::jsonb)) = 0
        then null
        else array(select jsonb_array_elements_text(p_candidate -> 'eligibilityStates')) end,
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
      listing_id, official_url_key, content_fingerprint, discovery_source,
      official_source_url, extraction_confidence, extraction_factors,
      extraction_summary, content_hash
    ) values (
      v_listing_id,
      v_url_key,
      v_fingerprint,
      p_provenance ->> 'discoverySource',
      p_provenance ->> 'officialSourceUrl',
      (p_provenance ->> 'extractionConfidence')::numeric,
      case when jsonb_typeof(p_provenance -> 'extractionFactors') = 'null'
        then null else p_provenance -> 'extractionFactors' end,
      p_provenance ->> 'extractionSummary',
      p_provenance ->> 'contentHash'
    );

    return jsonb_build_object('listing_id', v_listing_id, 'created', true);
  exception when unique_violation then
    select listing_id
      into v_existing_id
      from public.listing_ingestion
     where (v_url_key is not null and official_url_key = v_url_key)
        or content_fingerprint = v_fingerprint
     limit 1;
    if found then
      update public.listing_ingestion
         set last_seen_at = clock_timestamp()
       where listing_id = v_existing_id;
      return jsonb_build_object('listing_id', v_existing_id, 'created', false);
    end if;
    raise;
  end;
end;
$$;

comment on function public.create_ingested_listing_with_provenance(jsonb, jsonb) is
  'Atomically deduplicates and creates a private ingestion draft with provenance.';

revoke all on function public.create_ingested_listing_with_provenance(jsonb, jsonb) from public;
revoke all on function public.create_ingested_listing_with_provenance(jsonb, jsonb) from anon;
revoke all on function public.create_ingested_listing_with_provenance(jsonb, jsonb) from authenticated;
grant execute on function public.create_ingested_listing_with_provenance(jsonb, jsonb) to service_role;
