begin;

select plan(9);

select ok(
  has_function_privilege(
    'service_role',
    'public.enqueue_official_url_intake_work(jsonb)',
    'EXECUTE'
  ),
  'service role can call the strict official intake boundary'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.enqueue_source_discovery_work(text,jsonb)',
    'EXECUTE'
  ),
  'service role retains generic discovery enqueue for non-official sources'
);

set local role service_role;

select is(
  public.enqueue_official_url_intake_work(
    '[{"key":"admin-official:pgtap-immutable","payload":{"kind":"admin_official_url_v1","officialUrl":"https://sponsor.example.test/rules/one"}}]'::jsonb
  ),
  1,
  'strict official intake inserts new work'
);

select is(
  public.enqueue_official_url_intake_work(
    '[{"key":"admin-official:pgtap-immutable","payload":{"kind":"admin_official_url_v1","officialUrl":"https://sponsor.example.test/rules/one"}}]'::jsonb
  ),
  0,
  'an exact strict replay is a no-op'
);

select throws_ok(
  $$
    select public.enqueue_source_discovery_work(
      'official_direct',
      '[{"key":"admin-official:pgtap-immutable","payload":{"kind":"admin_official_url_v1","officialUrl":"https://attacker.example.test/reopened"}}]'::jsonb
    )
  $$,
  '42501',
  'official_direct_requires_strict_intake_rpc',
  'generic enqueue cannot overwrite or reopen official intake work'
);

reset role;

select is(
  (
    select payload->>'officialUrl'
      from public.source_discovery_work_item
     where source_id = 'official_direct'
       and item_key = 'admin-official:pgtap-immutable'
  ),
  'https://sponsor.example.test/rules/one',
  'the rejected generic call leaves the strict payload unchanged'
);

set local role service_role;

select is(
  public.enqueue_source_discovery_work(
    'sweeps_advantage',
    '[{"key":"pgtap-generic-source","payload":{"version":1}}]'::jsonb
  ),
  1,
  'generic enqueue still creates non-official discovery work'
);

reset role;

select ok(
  not has_table_privilege(
    'service_role',
    'public.source_discovery_work_item',
    'UPDATE'
  ),
  'service role cannot bypass claim CAS with a direct table update'
);

select ok(
  to_regprocedure('public.defer_source_discovery_work(text,text)') is null,
  'the legacy key-only defer overload remains removed'
);

select * from finish();

rollback;
