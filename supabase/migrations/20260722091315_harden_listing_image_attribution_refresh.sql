-- Attribution must describe the current stored asset. A URL replacement that
-- reuses the previous credit is stale even when the source type stays within
-- the approved photo bucket. Changed attribution supplied atomically is kept.

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
  elsif tg_op = 'UPDATE' then
    if new.main_image_url is distinct from old.main_image_url
       and new.image_attribution is not distinct from old.image_attribution then
      new.image_attribution := null;
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.clear_stale_listing_image_attribution()
  from public, anon, authenticated, service_role;
