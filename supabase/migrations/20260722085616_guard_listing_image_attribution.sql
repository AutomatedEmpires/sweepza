-- Attribution is valid only for the stored image it describes. Host/operator
-- replacement URLs must never inherit credit from a prior ingested asset.

update public.listing
   set image_attribution = null
 where image_attribution is not null
   and (
     main_image_url is null
     or image_source_type is distinct from 'photo_bucket'::public.image_source_type
   );

drop trigger if exists trg_clear_stale_listing_image_attribution on public.listing;
drop function if exists public.clear_stale_listing_image_attribution();

create or replace function private.clear_stale_listing_image_attribution()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.main_image_url is null
     or new.image_source_type is distinct from 'photo_bucket'::public.image_source_type then
    new.image_attribution := null;
  end if;
  return new;
end;
$$;

revoke all on function private.clear_stale_listing_image_attribution()
  from public, anon, authenticated, service_role;

create trigger trg_clear_stale_listing_image_attribution
  before insert or update of main_image_url, image_source_type, image_attribution
  on public.listing
  for each row
  execute function private.clear_stale_listing_image_attribution();

alter table public.listing
  drop constraint if exists listing_image_attribution_matches_source;
alter table public.listing
  add constraint listing_image_attribution_matches_source check (
    image_attribution is null
    or (
      main_image_url is not null
      and image_source_type is not distinct from 'photo_bucket'::public.image_source_type
    )
  ) not valid;
alter table public.listing
  validate constraint listing_image_attribution_matches_source;
