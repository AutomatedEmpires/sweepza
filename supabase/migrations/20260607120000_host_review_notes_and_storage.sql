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
