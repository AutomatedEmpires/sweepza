-- Add host-visible review notes and create host logo storage bucket.

alter table listing add column if not exists review_notes text;

-- Storage bucket for host logos.
insert into storage.buckets (id, name, public)
values ('host-logos', 'host-logos', true)
on conflict (id) do nothing;

-- Storage policies: host can write to host-logos/{hostId}/...
create policy if not exists "host_logo_read" on storage.objects for select
  using (bucket_id = 'host-logos');

create policy if not exists "host_logo_write_own" on storage.objects for all
  using (
    bucket_id = 'host-logos'
    and (split_part(name, '/', 1)) = (current_host_id()::text)
  )
  with check (
    bucket_id = 'host-logos'
    and (split_part(name, '/', 1)) = (current_host_id()::text)
  );

-- Host analytics RPC: SECURITY DEFINER so it can aggregate seeker-state rows
-- (which are row-owner-only) for a host's own listings.
create or replace function host_listing_stats(host_id_in uuid)
returns table (
  listing_id uuid,
  view_count int,
  save_count int,
  enter_count int,
  entries_this_week int,
  entries_last_week int
)
language sql stable security definer set search_path = public, pg_temp as $$
  with host_listings as (
    select id from listing where host_id = host_id_in
  ),
  base as (
    select
      s.listing_id,
      count(*) filter (where s.viewed_at is not null) as view_count,
      count(*) filter (where s.saved_at is not null) as save_count,
      count(*) filter (where s.entered_at is not null) as enter_count,
      count(*) filter (where s.entered_at >= (date_trunc('week', now()) - interval '0 day')) as entries_this_week,
      count(*) filter (where s.entered_at >= (date_trunc('week', now()) - interval '7 day') and s.entered_at < date_trunc('week', now())) as entries_last_week
    from listing_seeker_state s
    join host_listings l on l.id = s.listing_id
    group by s.listing_id
  )
  select
    l.id as listing_id,
    coalesce(b.view_count, 0)::int,
    coalesce(b.save_count, 0)::int,
    coalesce(b.enter_count, 0)::int,
    coalesce(b.entries_this_week, 0)::int,
    coalesce(b.entries_last_week, 0)::int
  from host_listings l
  left join base b on b.listing_id = l.id;
$$;

grant execute on function host_listing_stats(uuid) to authenticated;
