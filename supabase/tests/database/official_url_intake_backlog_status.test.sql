begin;

select plan(7);

select ok(
  has_function_privilege(
    'service_role',
    'public.get_official_url_intake_backlog_status()',
    'EXECUTE'
  ),
  'service role can read aggregate official intake status'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.get_official_url_intake_backlog_status()',
    'EXECUTE'
  ),
  'authenticated users cannot bypass the admin status boundary'
);

insert into public.source_discovery_work_item (
  source_id,
  item_key,
  payload,
  discovered_at,
  attempts,
  completed_at,
  dead_lettered_at,
  dead_letter_reason
) values
  (
    'official_direct',
    'pgtap-status-pending',
    '{"kind":"admin_official_url_v1"}'::jsonb,
    clock_timestamp() - interval '30 minutes',
    0,
    null,
    null,
    null
  ),
  (
    'official_direct',
    'pgtap-status-retrying',
    '{"kind":"admin_official_url_v1"}'::jsonb,
    clock_timestamp() - interval '2 hours',
    2,
    null,
    null,
    null
  ),
  (
    'official_direct',
    'pgtap-status-completed',
    '{"kind":"admin_official_url_v1"}'::jsonb,
    clock_timestamp() - interval '3 hours',
    1,
    clock_timestamp() - interval '1 hour',
    null,
    null
  ),
  (
    'official_direct',
    'pgtap-status-dead-lettered',
    '{"kind":"admin_official_url_v1"}'::jsonb,
    clock_timestamp() - interval '4 hours',
    1,
    clock_timestamp() - interval '1 hour',
    clock_timestamp() - interval '1 hour',
    'invalid payload'
  );

set local role service_role;

select is(
  (select pending from public.get_official_url_intake_backlog_status()),
  1::bigint,
  'snapshot reports pending work'
);

select is(
  (select retrying from public.get_official_url_intake_backlog_status()),
  1::bigint,
  'snapshot reports retrying work'
);

select is(
  (select completed from public.get_official_url_intake_backlog_status()),
  1::bigint,
  'snapshot reports successful terminal work'
);

select is(
  (select dead_lettered from public.get_official_url_intake_backlog_status()),
  1::bigint,
  'snapshot reports dead-lettered work'
);

select ok(
  (
    select oldest_pending_at <= clock_timestamp() - interval '119 minutes'
      from public.get_official_url_intake_backlog_status()
  ),
  'snapshot returns the oldest open work timestamp'
);

select * from finish();

rollback;
