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

-- The public projection must stay intact or every listing surface breaks.
-- lib/db/listings.ts selects these columns explicitly; a `select *` would
-- expand to the note columns and fail the whole query with 42501.
select ok(
  has_column_privilege('anon', 'public.listing', 'title', 'SELECT')
  and has_column_privilege('anon', 'public.listing', 'end_date', 'SELECT')
  and has_column_privilege('anon', 'public.listing', 'official_rules_url', 'SELECT')
  and has_column_privilege('anon', 'public.listing', 'no_purchase_necessary', 'SELECT'),
  'anon retains the columns public listing surfaces render'
);

-- 2. Public host attribution resolves for visitors ------------------------
-- host.app_user_id carries a unique index, so each host needs its own owner.
insert into public.app_user (id, clerk_user_id, display_name) values
  ('00000000-0000-4000-8000-0000000000a1', 'pgtap_host_owner_1', 'pgtap owner one'),
  ('00000000-0000-4000-8000-0000000000a2', 'pgtap_host_owner_2', 'pgtap owner two');

-- verification_status is host_verification_status:
-- none | self_verified | admin_verified.
insert into public.host (id, app_user_id, display_name, stripe_customer_id, verification_status)
values
  ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000a1',
   'Published Sponsor', 'cus_pgtap_secret', 'admin_verified'),
  ('00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-0000000000a2',
   'Unpublished Sponsor', 'cus_pgtap_secret2', 'none');

-- A publishable canonical listing: the active-listing publish guard requires
-- sponsor, image, rules, eligibility, category, and no-purchase fields plus a
-- reviewed/verified status, and host_public now mirrors the full public
-- boundary (end date, verification, moderation).
insert into public.listing (
  id, slug, title, short_description, long_description,
  prize_name, prize_value, prize_currency, prize_category, winner_count,
  main_image_url, image_source_type, image_alt_text,
  entry_url, official_rules_url,
  start_date, end_date, entry_frequency, entry_limit_notes,
  eligibility_country, age_requirement, no_purchase_necessary,
  source_type, public_source_label, created_by_role,
  host_id, sponsor_name, sponsor_url,
  lifecycle_status, visibility_status, moderation_status,
  listing_verification_status, published_at
) values (
  '00000000-0000-4000-8000-0000000000c1', 'pgtap-public-listing',
  'pgtap public listing', 'short summary', 'longer description body',
  'Prize', 10000, 'USD', 'cash', 1,
  'https://cdn.example.com/pgtap.png', 'generated', 'Representative photo',
  'https://sponsor.example.com/enter', 'https://sponsor.example.com/rules',
  current_date - 1, current_date + 30, 'one_time', 'One entry per person.',
  'US', 18, true,
  'host_submitted', 'host_submitted', 'host',
  '00000000-0000-4000-8000-0000000000b1', 'Published Sponsor',
  'https://sponsor.example.com',
  'active', 'public', 'clear',
  'verified', now()
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

reset role;

-- The base table is closed by GRANT, not by RLS returning zero rows: selecting
-- from it as anon raises 42501, which would abort this transaction rather than
-- fail an assertion. Assert the missing privilege directly instead.
select ok(
  not has_table_privilege('anon', 'public.host', 'SELECT'),
  'the host base table itself stays closed to anon'
);

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
