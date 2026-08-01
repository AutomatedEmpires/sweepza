-- Preserve every distinct provenance observation after canonical identity has
-- already been claimed. listing_ingestion remains the immutable first-ingest
-- record; this ledger captures later exact-dedupe sightings without rewriting
-- their source, extraction, or content evidence.

create table public.listing_ingestion_observation (
  id bigint generated always as identity primary key,
  listing_id uuid not null
    references public.listing_ingestion(listing_id) on delete cascade,
  provenance_identity text not null,
  official_url_key text,
  content_fingerprint text not null,
  variant_key text not null,
  discovery_source text not null,
  official_source_url text,
  extraction_confidence numeric,
  extraction_factors jsonb,
  extraction_summary text,
  content_hash text,
  first_observed_at timestamptz not null default clock_timestamp(),
  last_observed_at timestamptz not null default clock_timestamp(),

  constraint listing_ingestion_observation_identity_sha256 check (
    provenance_identity ~ '^[0-9a-f]{64}$'
  ),
  constraint listing_ingestion_observation_required_fields check (
    nullif(btrim(content_fingerprint), '') is not null
    and nullif(btrim(variant_key), '') is not null
    and nullif(btrim(discovery_source), '') is not null
    and char_length(content_fingerprint) <= 512
    and char_length(variant_key) <= 2048
    and char_length(discovery_source) <= 256
  ),
  constraint listing_ingestion_observation_url_lengths check (
    (official_url_key is null or char_length(official_url_key) <= 4096)
    and (
      official_source_url is null
      or (
        char_length(official_source_url) <= 4096
        and official_source_url ~ '^https://[^[:space:]]+$'
      )
    )
  ),
  constraint listing_ingestion_observation_confidence_range check (
    extraction_confidence is null
    or extraction_confidence between 0 and 1
  ),
  constraint listing_ingestion_observation_factors_array check (
    extraction_factors is null
    or case
      when jsonb_typeof(extraction_factors) = 'array' then
        jsonb_array_length(extraction_factors) <= 100
        and pg_column_size(extraction_factors) <= 65536
      else false
    end
  ),
  constraint listing_ingestion_observation_evidence_bounds check (
    (
      extraction_summary is null
      or char_length(extraction_summary) <= 10000
    )
    and (
      content_hash is null
      or char_length(content_hash) <= 512
    )
  ),
  constraint listing_ingestion_observation_time_order check (
    last_observed_at >= first_observed_at
  ),
  constraint listing_ingestion_observation_identity_unique
    unique (listing_id, provenance_identity)
);

create index listing_ingestion_observation_listing_seen_idx
  on public.listing_ingestion_observation (
    listing_id,
    last_observed_at desc,
    id desc
  );

comment on table public.listing_ingestion_observation is
  'Distinct canonical provenance observations. listing_ingestion remains the first-ingest record; exact retries refresh only last_observed_at.';

alter table public.listing_ingestion_observation enable row level security;

create policy listing_ingestion_observation_operator_read
  on public.listing_ingestion_observation
  for select
  to authenticated
  using (
    (select private.is_admin())
    or (select private.is_owner())
  );

revoke all on table public.listing_ingestion_observation
  from public, anon, authenticated, service_role;
grant select on table public.listing_ingestion_observation to authenticated;
revoke all on sequence public.listing_ingestion_observation_id_seq
  from public, anon, authenticated, service_role;

create function public.record_listing_ingestion_observation(
  p_listing_id uuid,
  p_provenance_identity text,
  p_provenance jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing public.listing_ingestion_observation%rowtype;
  v_observation_id bigint;
  v_official_url_key text;
  v_content_fingerprint text;
  v_variant_key text;
  v_discovery_source text;
  v_official_source_url text;
  v_extraction_confidence numeric;
  v_extraction_factors jsonb;
  v_extraction_summary text;
  v_content_hash text;
begin
  if p_listing_id is null
     or p_provenance_identity is null
     or p_provenance_identity !~ '^[0-9a-f]{64}$'
     or p_provenance is null
     or jsonb_typeof(p_provenance) <> 'object' then
    raise exception 'valid listing, provenance identity, and provenance are required'
      using errcode = '22023';
  end if;

  if not exists (
    select 1
      from public.listing_ingestion first_ingest
     where first_ingest.listing_id = p_listing_id
  ) then
    raise exception 'listing ingestion record does not exist'
      using errcode = '23503';
  end if;

  begin
    v_official_url_key :=
      nullif(p_provenance ->> 'officialUrlKey', '');
    v_content_fingerprint :=
      nullif(btrim(p_provenance ->> 'contentFingerprint'), '');
    v_variant_key :=
      nullif(btrim(p_provenance ->> 'variantKey'), '');
    v_discovery_source :=
      nullif(btrim(p_provenance ->> 'discoverySource'), '');
    v_official_source_url :=
      nullif(p_provenance ->> 'officialSourceUrl', '');
    v_extraction_confidence :=
      nullif(p_provenance ->> 'extractionConfidence', '')::numeric;
    v_extraction_factors := case
      when p_provenance -> 'extractionFactors' is null
        or jsonb_typeof(p_provenance -> 'extractionFactors') = 'null'
      then null
      else p_provenance -> 'extractionFactors'
    end;
    v_extraction_summary :=
      nullif(p_provenance ->> 'extractionSummary', '');
    v_content_hash :=
      nullif(p_provenance ->> 'contentHash', '');
  exception
    when invalid_text_representation or numeric_value_out_of_range then
      raise exception 'invalid provenance observation'
        using errcode = '22023';
  end;

  if v_content_fingerprint is null
     or v_variant_key is null
     or v_discovery_source is null then
    raise exception 'content fingerprint, variant key, and discovery source are required'
      using errcode = '23514';
  end if;

  if (v_official_url_key is not null
      and char_length(v_official_url_key) > 4096)
     or char_length(v_content_fingerprint) > 512
     or char_length(v_variant_key) > 2048
     or char_length(v_discovery_source) > 256
     or (
       v_official_source_url is not null
       and (
         char_length(v_official_source_url) > 4096
         or v_official_source_url !~ '^https://[^[:space:]]+$'
       )
     )
     or (
       v_extraction_summary is not null
       and char_length(v_extraction_summary) > 10000
     )
     or (
       v_content_hash is not null
       and char_length(v_content_hash) > 512
     ) then
    raise exception 'provenance observation exceeds bounded text limits'
      using errcode = '22023';
  end if;

  if v_extraction_confidence is not null
     and v_extraction_confidence not between 0 and 1 then
    raise exception 'extraction confidence must be between zero and one'
      using errcode = '23514';
  end if;

  if v_extraction_factors is not null
     and not (
       case
         when jsonb_typeof(v_extraction_factors) = 'array' then
           jsonb_array_length(v_extraction_factors) <= 100
           and pg_column_size(v_extraction_factors) <= 65536
         else false
       end
     ) then
    raise exception 'extraction factors exceed bounded array limits'
      using errcode = '23514';
  end if;

  insert into public.listing_ingestion_observation (
    listing_id,
    provenance_identity,
    official_url_key,
    content_fingerprint,
    variant_key,
    discovery_source,
    official_source_url,
    extraction_confidence,
    extraction_factors,
    extraction_summary,
    content_hash
  ) values (
    p_listing_id,
    p_provenance_identity,
    v_official_url_key,
    v_content_fingerprint,
    v_variant_key,
    v_discovery_source,
    v_official_source_url,
    v_extraction_confidence,
    v_extraction_factors,
    v_extraction_summary,
    v_content_hash
  )
  on conflict (listing_id, provenance_identity) do nothing
  returning id into v_observation_id;

  if found then
    return jsonb_build_object(
      'observation_id', v_observation_id,
      'created', true
    );
  end if;

  select *
    into v_existing
    from public.listing_ingestion_observation observation
   where observation.listing_id = p_listing_id
     and observation.provenance_identity = p_provenance_identity;

  if not found then
    raise exception 'provenance observation conflict could not be resolved'
      using errcode = '40001';
  end if;

  if v_existing.official_url_key is distinct from v_official_url_key
     or v_existing.content_fingerprint <> v_content_fingerprint
     or v_existing.variant_key <> v_variant_key
     or v_existing.discovery_source <> v_discovery_source
     or v_existing.official_source_url is distinct from v_official_source_url
     or v_existing.extraction_confidence
       is distinct from v_extraction_confidence
     or v_existing.extraction_factors is distinct from v_extraction_factors
     or v_existing.extraction_summary is distinct from v_extraction_summary
     or v_existing.content_hash is distinct from v_content_hash then
    raise exception 'provenance identity was already used for different evidence'
      using errcode = '23505';
  end if;

  update public.listing_ingestion_observation
     set last_observed_at = greatest(
       last_observed_at,
       clock_timestamp()
     )
   where id = v_existing.id;

  return jsonb_build_object(
    'observation_id', v_existing.id,
    'created', false
  );
end;
$$;

comment on function public.record_listing_ingestion_observation(
  uuid,
  text,
  jsonb
) is
  'Idempotently appends distinct listing provenance evidence and refreshes only an exact observation. Service role only.';

revoke all on function public.record_listing_ingestion_observation(
  uuid,
  text,
  jsonb
) from public, anon, authenticated;
grant execute on function public.record_listing_ingestion_observation(
  uuid,
  text,
  jsonb
) to service_role;
