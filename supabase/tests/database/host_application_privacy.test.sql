begin;

select plan(5);

insert into public.app_user (
  id,
  clerk_user_id,
  email,
  is_admin
) values
  ('10000000-0000-4000-8000-000000000001', 'test_host_privacy_reviewer', 'reviewer@example.test', true),
  ('10000000-0000-4000-8000-000000000002', 'test_host_privacy_new', 'new-host@example.test', false),
  ('10000000-0000-4000-8000-000000000003', 'test_host_privacy_existing', 'existing-host@example.test', false);

insert into public.host_application (
  id,
  applicant_user_id,
  legal_organization_name,
  public_display_name,
  website_url,
  official_email,
  authority_basis,
  authority_evidence,
  authority_evidence_url,
  authority_attested,
  terms_version
) values
  (
    '20000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000002',
    'New Host Privacy Test LLC',
    'New Host Privacy Test',
    'https://new-host.example.test',
    'authority@new-host.example.test',
    'owner',
    'PRIVATE incorporation record reference 8675309; never publish this evidence.',
    'https://new-host.example.test/private-evidence',
    true,
    'host-terms-v1'
  );

select is(
  public.review_host_application(
    '20000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    'approve',
    'Authority verified through private operator review.'
  )->>'status',
  'approved',
  'a valid host application can still be approved'
);

select ok(
  (
    select short_description is null
      from public.host
     where app_user_id = '10000000-0000-4000-8000-000000000002'
  ),
  'approval never copies private authority evidence into host.short_description'
);

select ok(
  (
    select short_description is null
      from public.host_public
     where id = (
       select id
         from public.host
        where app_user_id = '10000000-0000-4000-8000-000000000002'
     )
  ),
  'private authority evidence is absent from the public host projection'
);

insert into public.host (
  app_user_id,
  display_name,
  website_url,
  short_description
) values (
  '10000000-0000-4000-8000-000000000003',
  'Existing Host Privacy Test',
  'https://existing-host.example.test',
  'Public organization description supplied by the host.'
);

insert into public.host_application (
  id,
  applicant_user_id,
  legal_organization_name,
  public_display_name,
  website_url,
  official_email,
  authority_basis,
  authority_evidence,
  authority_evidence_url,
  authority_attested,
  terms_version
) values (
  '20000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000003',
  'Existing Host Privacy Test LLC',
  'Existing Host Privacy Test',
  'https://existing-host.example.test',
  'authority@existing-host.example.test',
  'employee',
  'PRIVATE employment verification reference 246810; never publish this evidence.',
  null,
  true,
  'host-terms-v1'
);

select is(
  public.review_host_application(
    '20000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000001',
    'approve',
    'Existing host authority verified through private operator review.'
  )->>'status',
  'approved',
  'an existing host application can still be approved'
);

select is(
  (
    select short_description
      from public.host
     where app_user_id = '10000000-0000-4000-8000-000000000003'
  ),
  'Public organization description supplied by the host.',
  'approval preserves an existing public host description'
);

select * from finish();

rollback;
