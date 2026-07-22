begin;

select plan(16);

select is(
  private.normalize_legacy_generated_listing_slug_value(
    'ixed-ase-weepstakes-12345678',
    'Mixed Case Sweepstakes',
    'Prize',
    'owner_seeded'::public.source_type,
    'system'::public.created_by_role
  ),
  'mixed-case-sweepstakes-12345678',
  'mixed-case generated slugs lowercase before filtering'
);

select is(
  private.normalize_legacy_generated_listing_slug_value(
    'mixed-case-sweepstakes-12345678',
    'Mixed Case Sweepstakes',
    'Prize',
    'owner_seeded'::public.source_type,
    'system'::public.created_by_role
  ),
  'mixed-case-sweepstakes-12345678',
  'corrected generated slugs are idempotent'
);

select is(
  private.normalize_legacy_generated_listing_slug_value(
    'editorial-summer-pick-12345678',
    'Mixed Case Sweepstakes',
    'Prize',
    'owner_seeded'::public.source_type,
    'system'::public.created_by_role
  ),
  'editorial-summer-pick-12345678',
  'custom slugs are never rewritten'
);

select is(
  private.normalize_legacy_generated_listing_slug_value(
    'ixed-ase-weepstakes-12345678',
    'Mixed Case Sweepstakes',
    'Prize',
    'host_submitted'::public.source_type,
    'host'::public.created_by_role
  ),
  'ixed-ase-weepstakes-12345678',
  'non-ingestion rows are never rewritten'
);

select is(
  private.normalize_legacy_generated_listing_slug_value(
    'rize-ame-deadbeef',
    '',
    'Prize Name',
    'owner_seeded'::public.source_type,
    'system'::public.created_by_role
  ),
  'prize-name-deadbeef',
  'prize-name fallback uses the corrected normalization order'
);

select is(
  private.normalize_legacy_generated_listing_slug_value(
    repeat('a', 55) || '-deadbeef',
    'UPPER ' || repeat('a', 60),
    'Prize',
    'owner_seeded'::public.source_type,
    'system'::public.created_by_role
  ),
  'upper-' || repeat('a', 49) || '-deadbeef',
  'generated bases remain capped at 55 characters and preserve the suffix'
);

set local role service_role;

insert into public.listing (
  slug,
  title,
  short_description,
  prize_name,
  entry_url,
  official_rules_url,
  end_date,
  source_type,
  public_source_label,
  created_by_role
) values (
  'rigger-ixed-ase-abcdef12',
  'Trigger Mixed Case',
  'A private draft used to prove generated slug normalization.',
  'Test prize',
  'https://example.test/trigger-entry',
  'https://example.test/trigger-rules',
  '2999-12-31',
  'owner_seeded',
  'found_by_sweepza',
  'system'
);

reset role;

select is(
  (
    select slug
      from public.listing
     where title = 'Trigger Mixed Case'
  ),
  'trigger-mixed-case-abcdef12',
  'the direct service-role insert trigger repairs an exact legacy generated slug'
);

insert into public.listing (
  slug,
  title,
  short_description,
  prize_name,
  entry_url,
  official_rules_url,
  end_date,
  source_type,
  public_source_label,
  created_by_role
) values (
  'editorial-trigger-pick-abcdef34',
  'Another Mixed Case',
  'A private draft used to prove custom slug preservation.',
  'Test prize',
  'https://example.test/custom-entry',
  'https://example.test/custom-rules',
  '2999-12-31',
  'owner_seeded',
  'found_by_sweepza',
  'system'
);

select is(
  (
    select slug
      from public.listing
     where title = 'Another Mixed Case'
  ),
  'editorial-trigger-pick-abcdef34',
  'the insert trigger preserves a custom slug'
);

select is(
  right(
    private.normalize_legacy_generated_listing_slug_value(
      'ixed-ase-weepstakes-cafebabe',
      'Mixed Case Sweepstakes',
      'Prize',
      'owner_seeded'::public.source_type,
      'system'::public.created_by_role
    ),
    9
  ),
  '-cafebabe',
  'the existing random suffix is preserved exactly'
);

alter table public.listing
  disable trigger trg_normalize_legacy_generated_listing_slug;

insert into public.listing (
  id,
  slug,
  title,
  short_description,
  prize_name,
  entry_url,
  official_rules_url,
  end_date,
  source_type,
  public_source_label,
  created_by_role
) values
  (
    '00000000-0000-4000-8000-000000000101',
    'l-aso-aper-hredder-weepstakes-a44874cc',
    'AARP El Paso Paper Shredder Sweepstakes',
    'Exact backfill fixture.',
    'Fixture prize',
    'https://example.test/backfill/el-paso',
    'https://example.test/backfill/el-paso-rules',
    '2999-12-31',
    'owner_seeded',
    'found_by_sweepza',
    'system'
  ),
  (
    '00000000-0000-4000-8000-000000000102',
    'ound-ock-xpress-uite-weepstakes-4eb0a8bf',
    'AARP Round Rock Express Suite Sweepstakes',
    'Exact backfill fixture.',
    'Fixture prize',
    'https://example.test/backfill/round-rock',
    'https://example.test/backfill/round-rock-rules',
    '2999-12-31',
    'owner_seeded',
    'found_by_sweepza',
    'system'
  ),
  (
    '00000000-0000-4000-8000-000000000103',
    'ome-weet-ome-iveaway-88514f2a',
    'HGTV Home Sweet Home Giveaway',
    'Exact backfill fixture.',
    'Fixture prize',
    'https://example.test/backfill/hgtv',
    'https://example.test/backfill/hgtv-rules',
    '2999-12-31',
    'owner_seeded',
    'found_by_sweepza',
    'system'
  ),
  (
    '00000000-0000-4000-8000-000000000104',
    'x-2026-weepstakes-0738ecec',
    'NOLAxNOLA 2026 Sweepstakes',
    'Exact backfill fixture.',
    'Fixture prize',
    'https://example.test/backfill/nola',
    'https://example.test/backfill/nola-rules',
    '2999-12-31',
    'owner_seeded',
    'found_by_sweepza',
    'system'
  );

alter table public.listing
  enable trigger trg_normalize_legacy_generated_listing_slug;

insert into public.listing_ingestion (
  listing_id,
  official_url_key,
  content_fingerprint,
  variant_key,
  official_source_url
) values
  (
    '00000000-0000-4000-8000-000000000101',
    'https://aarp.org/content/dam/aarp/states/tx/2026/tx-el-paso-aug-shredder-sweepstakes-official-rules-8-2026.pdf',
    'slug-repair-fixture-el-paso',
    'primary',
    'https://example.test/backfill/el-paso'
  ),
  (
    '00000000-0000-4000-8000-000000000102',
    'https://aarp.org/content/dam/aarp/states/tx/2026/sweepstakes-official-rules-round-rock-express-suite-experience.pdf',
    'slug-repair-fixture-round-rock',
    'primary',
    'https://example.test/backfill/round-rock'
  ),
  (
    '00000000-0000-4000-8000-000000000103',
    'https://xd.wayin.com/display/container/dc/3b301ab2-820d-4fdf-add8-716fa0dcd6e7/rules',
    'slug-repair-fixture-hgtv',
    'primary',
    'https://example.test/backfill/hgtv'
  ),
  (
    '00000000-0000-4000-8000-000000000104',
    'https://neworleans.com/nolaxnola/sweepstakes/rules',
    'slug-repair-fixture-nola',
    'primary',
    'https://example.test/backfill/nola'
  );

select is(
  private.repair_legacy_generated_listing_slugs(),
  4,
  'the production backfill repairs all four exact provenance-bound fixtures'
);

select is(
  (select slug from public.listing where id = '00000000-0000-4000-8000-000000000101'),
  'aarp-el-paso-paper-shredder-sweepstakes-a44874cc',
  'the El Paso production mapping is exact'
);

select is(
  (select slug from public.listing where id = '00000000-0000-4000-8000-000000000102'),
  'aarp-round-rock-express-suite-sweepstakes-4eb0a8bf',
  'the Round Rock production mapping is exact'
);

select is(
  (select slug from public.listing where id = '00000000-0000-4000-8000-000000000103'),
  'hgtv-home-sweet-home-giveaway-88514f2a',
  'the HGTV production mapping is exact'
);

select is(
  (select slug from public.listing where id = '00000000-0000-4000-8000-000000000104'),
  'nolaxnola-2026-sweepstakes-0738ecec',
  'the NOLAxNOLA production mapping is exact'
);

alter table public.listing
  disable trigger trg_normalize_legacy_generated_listing_slug;

insert into public.listing (
  id,
  slug,
  title,
  short_description,
  prize_name,
  entry_url,
  official_rules_url,
  end_date,
  source_type,
  public_source_label,
  created_by_role
) values (
  '00000000-0000-4000-8000-000000000105',
  'x-2026-weepstakes-0738ecec',
  'NOLAxNOLA 2026 Sweepstakes',
  'Near-miss backfill fixture.',
  'Fixture prize',
  'https://example.test/backfill/nola-near-miss',
  'https://example.test/backfill/nola-near-miss-rules',
  '2999-12-31',
  'owner_seeded',
  'found_by_sweepza',
  'system'
);

alter table public.listing
  enable trigger trg_normalize_legacy_generated_listing_slug;

insert into public.listing_ingestion (
  listing_id,
  official_url_key,
  content_fingerprint,
  variant_key,
  official_source_url
) values (
  '00000000-0000-4000-8000-000000000105',
  'https://neworleans.com/nolaxnola/sweepstakes/rules-near-miss',
  'slug-repair-fixture-nola-near-miss',
  'primary',
  'https://example.test/backfill/nola-near-miss'
);

select is(
  private.repair_legacy_generated_listing_slugs(),
  0,
  'the production backfill ignores a provenance near-miss'
);

select is(
  (select slug from public.listing where id = '00000000-0000-4000-8000-000000000105'),
  'x-2026-weepstakes-0738ecec',
  'the near-miss slug is left untouched'
);

select * from finish();

rollback;
