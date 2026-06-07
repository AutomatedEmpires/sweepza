-- Complete host-experience enum/storage/table additions.
-- Keep this file free of references to the new enum labels; Postgres requires
-- newly added enum values to be committed before they are used.

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
