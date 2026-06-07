-- Host Experience (Lane E): enum additions, host-visible review notes,
-- notification preferences, and the host-logos storage bucket.

-- 1. Enum value additions (idempotent).
alter type lifecycle_status add value if not exists 'held';
alter type lifecycle_status add value if not exists 'inactive';
alter type visibility_status add value if not exists 'unlisted';
alter type moderation_status add value if not exists 'draft';
alter type moderation_status add value if not exists 'submitted';
alter type moderation_status add value if not exists 'held';
alter type moderation_status add value if not exists 'rejected';
alter type subscription_status add value if not exists 'trialing';

-- 2. Host-visible review notes (distinct from review_notes_internal).
alter table listing add column if not exists review_notes text;

-- 3. Notification preferences for host email events.
alter table notification_pref add column if not exists email_on_listing_approved boolean not null default true;
alter table notification_pref add column if not exists email_on_listing_held boolean not null default true;
alter table notification_pref add column if not exists email_on_listing_expiring_soon boolean not null default true;
alter table notification_pref add column if not exists email_on_new_reaction boolean not null default true;

-- 4. host-logos storage bucket (public read; host-scoped writes).
insert into storage.buckets (id, name, public)
values ('host-logos', 'host-logos', true)
on conflict (id) do nothing;

drop policy if exists host_logo_read on storage.objects;
create policy host_logo_read on storage.objects
  for select
  using (bucket_id = 'host-logos');

drop policy if exists host_logo_write_own on storage.objects;
create policy host_logo_write_own on storage.objects
  for insert
  with check (
    bucket_id = 'host-logos'
    and split_part(name, '/', 1) = current_host_id()::text
  );

drop policy if exists host_logo_update_own on storage.objects;
create policy host_logo_update_own on storage.objects
  for update
  using (
    bucket_id = 'host-logos'
    and split_part(name, '/', 1) = current_host_id()::text
  );
