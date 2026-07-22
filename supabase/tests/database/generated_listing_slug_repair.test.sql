begin;

select plan(9);

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

select * from finish();

rollback;
