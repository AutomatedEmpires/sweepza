begin;

select plan(11);

-- 1. Operator note columns are not readable by client roles ---------------
select ok(
  not has_column_privilege('anon', 'public.listing', 'review_notes_internal', 'SELECT'),
  'anon cannot read listing.review_notes_internal'
);
select ok(
  not has_column_privilege('anon', 'public.listing', 'sponsor_notes_internal', 'SELECT'),
  'anon cannot read listing.sponsor_notes_internal'
);
select ok(
  not has_column_privilege('anon', 'public.listing', 'review_notes', 'SELECT'),
  'anon cannot read listing.review_notes'
);
select ok(
  not has_column_privilege('authenticated', 'public.listing', 'review_notes_internal', 'SELECT'),
  'authenticated cannot read listing.review_notes_internal'
);

-- The public projection must still be intact, or every listing page breaks.
select ok(
  has_column_privilege('anon', 'public.listing', 'title', 'SELECT')
  and has_column_privilege('anon', 'public.listing', 'end_date', 'SELECT')
  and has_column_privilege('anon', 'public.listing', 'official_rules_url', 'SELECT')
  and has_column_privilege('anon', 'public.listing', 'no_purchase_necessary', 'SELECT'),
  'anon retains the columns public listing surfaces render'
);

-- 2. Public host attribution resolves for visitors ------------------------
insert into public.app_user (id, clerk_user_id, display_name)
values ('00000000-0000-4000-8000-0000000000a1', 'pgtap_host_owner', 'pgtap host owner');

insert into public.host (id, app_user_id, display_name, stripe_customer_id, verification_status)
values
  ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000a1',
   'Published Sponsor', 'cus_pgtap_secret', 'verified'),
  ('00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-0000000000a1',
   'Unpublished Sponsor', 'cus_pgtap_secret2', 'unverified');

insert into public.listing (
  id, slug, title, short_description, entry_url, start_date, end_date,
  host_id, source_type, created_by_role, visibility_status, lifecycle_status
) values (
  '00000000-0000-4000-8000-0000000000c1', 'pgtap-public-listing', 'pgtap public listing',
  'short', 'https://sponsor.example.com/enter',
  current_date - 1, current_date + 30,
  '00000000-0000-4000-8000-0000000000b1', 'host_submitted', 'host', 'public', 'active'
);

set local role anon;

select is(
  (select count(*)::int from public.host_public),
  1,
  'anon sees exactly the host that has a live public listing'
);
select is(
  (select display_name from public.host_public),
  'Published Sponsor',
  'anon resolves the publishing host by name (attribution is not dead)'
);
select is(
  (select count(*)::int from public.host_public
    where id = '00000000-0000-4000-8000-0000000000b2'),
  0,
  'a host with no public listing stays private'
);
select is(
  (select count(*)::int from public.host),
  0,
  'the host base table itself stays closed to anon'
);

reset role;

select ok(
  not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'host_public'
      and column_name in ('stripe_customer_id', 'app_user_id', 'suspended_reason', 'verified_by')
  ),
  'host_public projects no billing, ownership, or moderation columns'
);

-- 3. anon holds no write grant the authenticated role lacks ---------------
select ok(
  not exists (
    select 1
    from unnest(array[
      'boost','host','listing','listing_claim','listing_seeker_state',
      'listing_tag','report','seeker_entry_event','subscription',
      'winner_post','winner_reaction'
    ]) as t(name)
    where has_table_privilege('anon', 'public.' || t.name, 'INSERT')
       or has_table_privilege('anon', 'public.' || t.name, 'UPDATE')
       or has_table_privilege('anon', 'public.' || t.name, 'DELETE')
       or has_table_privilege('anon', 'public.' || t.name, 'TRUNCATE')
  ),
  'anon has no insert/update/delete/truncate grant on any core table'
);

rollback;
