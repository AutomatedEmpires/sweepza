-- Rights-aware listing media ingestion, storage provenance, and attempt logs.
-- Public listing rows expose only the selected/fallback URL and attribution;
-- extraction diagnostics remain private to the service role and operators.

alter table public.listing
  add column if not exists image_attribution text;

create table if not exists public.listing_media_asset (
  id uuid primary key default gen_random_uuid(),
  content_hash text not null unique,
  stored_media_url text not null unique,
  storage_object_path text not null unique,
  width integer not null check (width > 0),
  height integer not null check (height > 0),
  aspect_ratio numeric(12, 6) not null check (aspect_ratio > 0),
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif')),
  byte_size integer not null check (byte_size > 0 and byte_size <= 8388608),
  first_retrieved_at timestamptz not null,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint listing_media_asset_sha256 check (content_hash ~ '^[a-f0-9]{64}$')
);

create table if not exists public.listing_media_source (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listing(id) on delete cascade,
  asset_id uuid not null references public.listing_media_asset(id) on delete restrict,
  source_page_url text not null,
  original_image_url text not null,
  final_source_url text not null,
  source_domain text not null,
  extraction_method text not null check (
    extraction_method in (
      'json_ld', 'open_graph', 'twitter_card', 'dom_hero',
      'responsive_srcset', 'lazy_loaded', 'css_background', 'sponsor_asset'
    )
  ),
  rights_status text not null check (rights_status in ('permitted', 'authorized')),
  rights_reason text not null,
  license_url text,
  attribution text,
  retrieved_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (listing_id, original_image_url)
);

create table if not exists public.listing_image_attempt (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listing(id) on delete cascade,
  source_page_url text not null,
  final_status text not null check (
    final_status in ('source_image', 'sponsor_asset', 'generated_fallback', 'permanent_failure')
  ),
  selected_asset_id uuid references public.listing_media_asset(id) on delete set null,
  selected_original_url text,
  fallback_url text,
  failure_reason text,
  applied boolean not null default false,
  retryable boolean not null default false,
  candidate_count integer not null default 0 check (candidate_count >= 0),
  candidate_diagnostics jsonb not null default '[]'::jsonb
    check (jsonb_typeof(candidate_diagnostics) = 'array'),
  processed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists listing_media_source_listing_idx
  on public.listing_media_source (listing_id, retrieved_at desc);
create index if not exists listing_image_attempt_listing_idx
  on public.listing_image_attempt (listing_id, processed_at desc);
create index if not exists listing_image_attempt_failure_idx
  on public.listing_image_attempt (final_status, processed_at desc)
  where final_status in ('generated_fallback', 'permanent_failure');

alter table public.listing_media_asset enable row level security;
alter table public.listing_media_source enable row level security;
alter table public.listing_image_attempt enable row level security;

revoke all on table public.listing_media_asset from anon, authenticated;
revoke all on table public.listing_media_source from anon, authenticated;
revoke all on table public.listing_image_attempt from anon, authenticated;
revoke all on table public.listing_media_asset from service_role;
revoke all on table public.listing_media_source from service_role;
revoke all on table public.listing_image_attempt from service_role;
grant select, insert, update on table public.listing_media_asset to service_role;
grant select, insert, update on table public.listing_media_source to service_role;
grant select, insert on table public.listing_image_attempt to service_role;

drop policy if exists listing_media_asset_operator_read on public.listing_media_asset;
create policy listing_media_asset_operator_read on public.listing_media_asset
  for select to authenticated
  using ((select private.is_owner()) or (select private.is_admin()));

drop policy if exists listing_media_source_operator_read on public.listing_media_source;
create policy listing_media_source_operator_read on public.listing_media_source
  for select to authenticated
  using ((select private.is_owner()) or (select private.is_admin()));

drop policy if exists listing_image_attempt_operator_read on public.listing_image_attempt;
create policy listing_image_attempt_operator_read on public.listing_image_attempt
  for select to authenticated
  using ((select private.is_owner()) or (select private.is_admin()));

grant select on table public.listing_media_asset to authenticated;
grant select on table public.listing_media_source to authenticated;
grant select on table public.listing_image_attempt to authenticated;

-- No object storage is created here. The schema and transaction are provider
-- neutral; selected-asset writes remain dormant while Sweepza's provider
-- contract is storage=none. Generated fallback URLs need no persisted object.

create or replace function public.finalize_listing_image(
  p_listing_id uuid,
  p_result jsonb
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_status text := p_result ->> 'finalStatus';
  v_selected jsonb := p_result -> 'selected';
  v_diagnostics jsonb := coalesce(p_result -> 'diagnostics', '[]'::jsonb);
  v_asset_id uuid;
  v_failure_reason text;
  v_applied boolean := false;
  v_retryable boolean := coalesce((p_result ->> 'retryable')::boolean, false);
  v_updated_count integer := 0;
  v_processed_at timestamptz := coalesce(
    nullif(p_result ->> 'processedAt', '')::timestamptz,
    clock_timestamp()
  );
begin
  if not exists (select 1 from public.listing where id = p_listing_id) then
    raise exception 'listing % does not exist', p_listing_id;
  end if;
  if v_status not in ('source_image', 'sponsor_asset', 'generated_fallback', 'permanent_failure') then
    raise exception 'invalid listing image status: %', coalesce(v_status, '<null>');
  end if;
  if jsonb_typeof(v_diagnostics) <> 'array' then
    raise exception 'listing image diagnostics must be an array';
  end if;

  if v_status in ('source_image', 'sponsor_asset') then
    if v_selected is null or jsonb_typeof(v_selected) <> 'object' then
      raise exception 'selected image metadata is required for status %', v_status;
    end if;

    insert into public.listing_media_asset (
      content_hash,
      stored_media_url,
      storage_object_path,
      width,
      height,
      aspect_ratio,
      mime_type,
      byte_size,
      first_retrieved_at,
      last_seen_at
    ) values (
      v_selected ->> 'contentHash',
      v_selected ->> 'storedUrl',
      v_selected ->> 'objectPath',
      (v_selected ->> 'width')::integer,
      (v_selected ->> 'height')::integer,
      (v_selected ->> 'aspectRatio')::numeric,
      v_selected ->> 'mimeType',
      (v_selected ->> 'byteSize')::integer,
      (v_selected ->> 'retrievedAt')::timestamptz,
      clock_timestamp()
    )
    on conflict (content_hash) do update
      set last_seen_at = clock_timestamp()
    returning id into v_asset_id;

    insert into public.listing_media_source (
      listing_id,
      asset_id,
      source_page_url,
      original_image_url,
      final_source_url,
      source_domain,
      extraction_method,
      rights_status,
      rights_reason,
      license_url,
      attribution,
      retrieved_at
    ) values (
      p_listing_id,
      v_asset_id,
      p_result ->> 'sourcePageUrl',
      v_selected ->> 'originalUrl',
      v_selected ->> 'finalSourceUrl',
      v_selected ->> 'sourceDomain',
      v_selected ->> 'method',
      v_selected ->> 'rightsStatus',
      v_selected ->> 'rightsReason',
      v_selected ->> 'licenseUrl',
      v_selected ->> 'attribution',
      (v_selected ->> 'retrievedAt')::timestamptz
    )
    on conflict (listing_id, original_image_url) do update
      set asset_id = excluded.asset_id,
          source_page_url = excluded.source_page_url,
          final_source_url = excluded.final_source_url,
          source_domain = excluded.source_domain,
          extraction_method = excluded.extraction_method,
          retrieved_at = excluded.retrieved_at,
          attribution = excluded.attribution,
          license_url = excluded.license_url,
          rights_status = excluded.rights_status,
          rights_reason = excluded.rights_reason;

    update public.listing
       set main_image_url = v_selected ->> 'storedUrl',
           image_source_type = 'photo_bucket'::public.image_source_type,
           image_alt_text = nullif(v_selected ->> 'altText', ''),
           image_attribution = nullif(v_selected ->> 'attribution', ''),
           category_fallback_image = null,
           updated_at = clock_timestamp()
     where id = p_listing_id
       and host_id is null
       and (
         main_image_url is null
         or image_source_type = 'photo_bucket'::public.image_source_type
       );

    get diagnostics v_updated_count = row_count;
    v_applied := v_updated_count = 1;
    if not v_applied then
      v_failure_reason := 'canonical_media_preserved';
    end if;
  else
    select string_agg(distinct nullif(item ->> 'rejectionReason', ''), ', ')
      into v_failure_reason
      from jsonb_array_elements(v_diagnostics) as item;

    -- Never replace or mutate a claimed host/operator listing because a later
    -- background pass failed. Fallback only fills an empty unclaimed listing.
    update public.listing
       set category_fallback_image = coalesce(
             nullif(p_result ->> 'fallbackUrl', ''),
             category_fallback_image
           ),
           updated_at = clock_timestamp()
     where id = p_listing_id
       and host_id is null
       and main_image_url is null
       and coalesce(image_source_type::text, '') not in ('host_upload', 'owner_upload')
       and category_fallback_image is distinct from coalesce(
         nullif(p_result ->> 'fallbackUrl', ''),
         category_fallback_image
       );

    get diagnostics v_updated_count = row_count;
    v_applied := v_updated_count = 1;
    if not v_applied then
      v_failure_reason := concat_ws(', ', v_failure_reason, 'canonical_media_preserved');
    end if;
  end if;

  insert into public.listing_image_attempt (
    listing_id,
    source_page_url,
    final_status,
    selected_asset_id,
    selected_original_url,
    fallback_url,
    failure_reason,
    applied,
    retryable,
    candidate_count,
    candidate_diagnostics,
    processed_at
  ) values (
    p_listing_id,
    p_result ->> 'sourcePageUrl',
    v_status,
    v_asset_id,
    v_selected ->> 'originalUrl',
    nullif(p_result ->> 'fallbackUrl', ''),
    v_failure_reason,
    v_applied,
    v_retryable,
    jsonb_array_length(v_diagnostics),
    v_diagnostics,
    v_processed_at
  );

  return jsonb_build_object(
    'listingId', p_listing_id,
    'finalStatus', v_status,
    'assetId', v_asset_id,
    'applied', v_applied
  );
end;
$$;

revoke all on function public.finalize_listing_image(uuid, jsonb) from public;
revoke all on function public.finalize_listing_image(uuid, jsonb) from anon, authenticated;
grant execute on function public.finalize_listing_image(uuid, jsonb) to service_role;

-- Verified against the official HGTV promotion copy: entry remains open
-- through August 12, 2026 at 8:59 a.m. ET. The prior normalized date was one
-- day early and contradicted the public summary.
update public.listing
   set end_date = '2026-08-12'::date,
       updated_at = clock_timestamp()
 where slug = 'hgtv-home-sweet-home-giveaway-88514f2a'
   and end_date = '2026-08-11'::date;
