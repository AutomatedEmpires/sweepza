-- Forward-only repair for canonical slugs generated before lowercasing.
--
-- The ingestion writer historically applied its lowercase-only character
-- class before lower(), stripping uppercase initials from mixed-case titles.
-- Keep the ingestion function itself stable and compensate only for its exact
-- generated-slug shape. Editorial/custom slugs never match this boundary.

create function private.normalize_legacy_generated_listing_slug_value(
  p_slug text,
  p_title text,
  p_prize_name text,
  p_source_type public.source_type,
  p_created_by_role public.created_by_role
) returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_identity text;
  v_suffix text;
  v_legacy_base text;
  v_corrected_base text;
begin
  if p_slug is null
     or p_source_type is distinct from 'owner_seeded'::public.source_type
     or p_created_by_role is distinct from 'system'::public.created_by_role
     or p_slug !~ '-[0-9a-f]{8}$' then
    return p_slug;
  end if;

  v_identity := coalesce(
    nullif(p_title, ''),
    nullif(p_prize_name, ''),
    'sweep'
  );
  v_suffix := right(p_slug, 9);
  v_legacy_base := left(coalesce(nullif(trim(both '-' from lower(regexp_replace(
    v_identity,
    '[^a-z0-9]+',
    '-',
    'g'
  ))), ''), 'sweep'), 55);

  if p_slug is distinct from v_legacy_base || v_suffix then
    return p_slug;
  end if;

  v_corrected_base := left(coalesce(nullif(trim(both '-' from regexp_replace(
    lower(v_identity),
    '[^a-z0-9]+',
    '-',
    'g'
  )), ''), 'sweep'), 55);

  return v_corrected_base || v_suffix;
end;
$$;

comment on function private.normalize_legacy_generated_listing_slug_value(
  text,
  text,
  text,
  public.source_type,
  public.created_by_role
) is
  'Corrects only the exact legacy ingestion-generated slug shape while preserving its random suffix.';
revoke all on function private.normalize_legacy_generated_listing_slug_value(
  text,
  text,
  text,
  public.source_type,
  public.created_by_role
) from public, anon, authenticated, service_role;

create function private.normalize_legacy_generated_listing_slug()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.slug := private.normalize_legacy_generated_listing_slug_value(
    new.slug,
    new.title,
    new.prize_name,
    new.source_type,
    new.created_by_role
  );
  return new;
end;
$$;
revoke all on function private.normalize_legacy_generated_listing_slug()
  from public, anon, authenticated, service_role;

drop trigger if exists trg_normalize_legacy_generated_listing_slug
  on public.listing;
create trigger trg_normalize_legacy_generated_listing_slug
  before insert on public.listing
  for each row execute function private.normalize_legacy_generated_listing_slug();

-- These are the four official launch rows observed in production. Match every
-- identity input and current slug so a concurrent editorial change is never
-- overwritten. The unique slug constraint fails the repair closed if a
-- corrected target has become occupied. Keep the bounded repair callable only
-- by its owner so the exact production predicate can be exercised by pgTAP.
create function private.repair_legacy_generated_listing_slugs()
returns integer
language sql
volatile
set search_path = ''
as $$
  with repairs(old_slug, corrected_slug, title, official_url_key) as (
    values
      (
        'l-aso-aper-hredder-weepstakes-a44874cc',
        'aarp-el-paso-paper-shredder-sweepstakes-a44874cc',
        'AARP El Paso Paper Shredder Sweepstakes',
        'https://aarp.org/content/dam/aarp/states/tx/2026/tx-el-paso-aug-shredder-sweepstakes-official-rules-8-2026.pdf'
      ),
      (
        'ound-ock-xpress-uite-weepstakes-4eb0a8bf',
        'aarp-round-rock-express-suite-sweepstakes-4eb0a8bf',
        'AARP Round Rock Express Suite Sweepstakes',
        'https://aarp.org/content/dam/aarp/states/tx/2026/sweepstakes-official-rules-round-rock-express-suite-experience.pdf'
      ),
      (
        'ome-weet-ome-iveaway-88514f2a',
        'hgtv-home-sweet-home-giveaway-88514f2a',
        'HGTV Home Sweet Home Giveaway',
        'https://xd.wayin.com/display/container/dc/3b301ab2-820d-4fdf-add8-716fa0dcd6e7/rules'
      ),
      (
        'x-2026-weepstakes-0738ecec',
        'nolaxnola-2026-sweepstakes-0738ecec',
        'NOLAxNOLA 2026 Sweepstakes',
        'https://neworleans.com/nolaxnola/sweepstakes/rules'
      )
  ), repaired as (
    update public.listing listing
       set slug = repair.corrected_slug
      from repairs repair
      join public.listing_ingestion ingestion
        on ingestion.official_url_key = repair.official_url_key
     where listing.id = ingestion.listing_id
       and listing.slug = repair.old_slug
       and listing.title = repair.title
    returning 1
  )
  select count(*)::integer from repaired;
$$;

comment on function private.repair_legacy_generated_listing_slugs() is
  'Repairs the exact four provenance-bound launch slugs and returns the affected row count.';
revoke all on function private.repair_legacy_generated_listing_slugs()
  from public, anon, authenticated, service_role;

select private.repair_legacy_generated_listing_slugs();
