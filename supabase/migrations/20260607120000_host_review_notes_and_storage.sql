-- Complete host-experience schema additions.

alter type lifecycle_status add value if not exists 'held';
alter type lifecycle_status add value if not exists 'inactive';
alter type visibility_status add value if not exists 'unlisted';
alter type moderation_status add value if not exists 'draft';
alter type moderation_status add value if not exists 'submitted';
alter type moderation_status add value if not exists 'held';
alter type moderation_status add value if not exists 'rejected';
alter type subscription_status add value if not exists 'trialing';

alter table listing add column if not exists review_notes text;
alter table notification_pref add column if not exists email_on_listing_approved boolean not null default true;
alter table notification_pref add column if not exists email_on_listing_held boolean not null default true;
alter table notification_pref add column if not exists email_on_listing_expiring_soon boolean not null default true;
alter table notification_pref add column if not exists email_on_new_reaction boolean not null default true;

insert into storage.buckets (id, name, public) values ('host-logos', 'host-logos', true) on conflict (id) do nothing;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'host_logo_read') then
    create policy "host_logo_read" on storage.objects for select using (bucket_id = 'host-logos');
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'host_logo_write_own') then
    create policy "host_logo_write_own" on storage.objects for all
      using (bucket_id = 'host-logos' and (split_part(name, '/', 1)) = (current_host_id()::text))
      with check (bucket_id = 'host-logos' and (split_part(name, '/', 1)) = (current_host_id()::text));
  end if;
end $$;

create or replace function host_listing_stats(host_id_in uuid)
returns table (listing_id uuid, view_count int, save_count int, enter_count int, entries_this_week int, entries_last_week int)
language sql stable security definer set search_path = public, pg_temp as $$
  with host_listings as (
    select id from listing where host_id = host_id_in and (host_id_in = current_host_id() or is_admin() or is_owner())
  ),
  base as (
    select
      s.listing_id,
      count(*) filter (where s.viewed_at is not null) as view_count,
      count(*) filter (where s.saved_at is not null) as save_count,
      count(*) filter (where s.entered_at is not null) as enter_count,
      count(*) filter (where s.entered_at >= date_trunc('week', now())) as entries_this_week,
      count(*) filter (where s.entered_at >= (date_trunc('week', now()) - interval '7 day') and s.entered_at < date_trunc('week', now())) as entries_last_week
    from listing_seeker_state s
    join host_listings l on l.id = s.listing_id
    group by s.listing_id
  )
  select l.id, coalesce(b.view_count, 0)::int, coalesce(b.save_count, 0)::int, coalesce(b.enter_count, 0)::int, coalesce(b.entries_this_week, 0)::int, coalesce(b.entries_last_week, 0)::int
  from host_listings l left join base b on b.listing_id = l.id;
$$;

grant execute on function host_listing_stats(uuid) to authenticated;

-- Hosts may only perform narrow moderation transitions required by the host flow;
-- all other privileged fields remain admin/owner controlled.
create or replace function protect_listing_privileged_fields() returns trigger
language plpgsql as $$
begin
  if current_clerk_user_id() is null or is_owner() or is_admin() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.is_featured := false;
    new.listing_verification_status := 'unreviewed';
    new.duplicate_status := 'clear';
    if new.moderation_status not in ('draft', 'submitted') then
      new.moderation_status := 'draft';
    end if;
    return new;
  elsif tg_op = 'UPDATE' then
    if new.is_featured is distinct from old.is_featured
      or new.listing_verification_status is distinct from old.listing_verification_status
      or new.duplicate_status is distinct from old.duplicate_status then
      raise exception 'not permitted: trust/moderation fields are admin-controlled';
    end if;

    if new.moderation_status is distinct from old.moderation_status then
      if not (
        (old.moderation_status in ('draft', 'clear') and new.moderation_status = 'submitted')
        or (old.moderation_status = 'held' and new.moderation_status = 'draft')
      ) then
        raise exception 'not permitted: moderation fields are admin-controlled';
      end if;
    end if;
    return new;
  end if;
  return new;
end;
$$;
