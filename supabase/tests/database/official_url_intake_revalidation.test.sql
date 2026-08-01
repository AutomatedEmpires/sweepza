begin;

select plan(16);

select ok(
  has_function_privilege(
    'service_role',
    'public.revalidate_official_url_intake_work(jsonb,text)',
    'EXECUTE'
  ),
  'service role can request an explicit official URL revalidation'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.enqueue_due_official_url_revalidation_work(integer,integer)',
    'EXECUTE'
  ),
  'service role can enqueue due official URL revalidations'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.revalidate_official_url_intake_work(jsonb,text)',
    'EXECUTE'
  ),
  'authenticated callers cannot bypass the admin revalidation route'
);

set local role service_role;

select is(
  public.enqueue_official_url_intake_work(
    '[{
      "key":"admin-official:pgtap-refresh",
      "payload":{
        "kind":"admin_official_url_v1",
        "officialUrl":"https://sponsor.example.test/rules",
        "idempotencyKey":"pgtap:refresh",
        "authority":{
          "type":"sweepza_operator",
          "appUserId":"33333333-3333-4333-8333-333333333333"
        }
      }
    }]'::jsonb
  ),
  1,
  'a new immutable request queues generation one'
);

select is(
  public.enqueue_official_url_intake_work(
    '[{
      "key":"admin-official:pgtap-refresh",
      "payload":{
        "kind":"admin_official_url_v1",
        "officialUrl":"https://sponsor.example.test/rules",
        "idempotencyKey":"pgtap:refresh",
        "authority":{
          "type":"sweepza_operator",
          "appUserId":"33333333-3333-4333-8333-333333333333"
        }
      }
    }]'::jsonb
  ),
  0,
  'an exact request replay stays a no-op'
);

select throws_ok(
  $$
    select public.revalidate_official_url_intake_work(
      '[{
        "key":"admin-official:pgtap-refresh",
        "payload":{
          "kind":"admin_official_url_v1",
          "officialUrl":"https://different.example.test/rules",
          "idempotencyKey":"pgtap:refresh",
          "authority":{
            "type":"sweepza_operator",
            "appUserId":"33333333-3333-4333-8333-333333333333"
          }
        }
      }]'::jsonb,
      'operator_revalidation'
    )
  $$,
  'P0001',
  'official_url_intake_idempotency_conflict',
  'explicit revalidation cannot change an immutable request payload'
);

select throws_ok(
  $$
    select public.revalidate_official_url_intake_work(
      '[{
        "key":"admin-official:pgtap-missing",
        "payload":{
          "kind":"admin_official_url_v1",
          "officialUrl":"https://missing.example.test/rules",
          "idempotencyKey":"pgtap:missing",
          "authority":{
            "type":"sweepza_operator",
            "appUserId":"33333333-3333-4333-8333-333333333333"
          }
        }
      }]'::jsonb,
      'operator_revalidation'
    )
  $$,
  'P0001',
  'official_url_intake_revalidation_not_found',
  'explicit revalidation cannot create an unsubmitted request'
);

reset role;

update public.source_discovery_work_item
   set completed_at = clock_timestamp()
 where source_id = 'official_direct'
   and item_key = 'admin-official:pgtap-refresh';

set local role service_role;

select is(
  public.revalidate_official_url_intake_work(
    '[{
      "key":"admin-official:pgtap-refresh",
      "payload":{
        "kind":"admin_official_url_v1",
        "officialUrl":"https://sponsor.example.test/rules",
        "idempotencyKey":"pgtap:refresh",
        "authority":{
          "type":"sweepza_operator",
          "appUserId":"33333333-3333-4333-8333-333333333333"
        }
      }
    }]'::jsonb,
    'operator_revalidation'
  ),
  1,
  'explicit revalidation queues a new generation'
);

select is(
  (
    select current_generation
    from public.official_url_intake_request
    where request_item_key = 'admin-official:pgtap-refresh'
  ),
  2,
  'request lineage advances to generation two'
);

select is(
  (
    select payload#>>'{refresh,reason}'
    from public.source_discovery_work_item
    where source_id = 'official_direct'
      and item_key = 'admin-official:pgtap-refresh:refresh:2'
  ),
  'operator_revalidation',
  'the new queue row records explicit refresh provenance'
);

select is(
  public.revalidate_official_url_intake_work(
    '[{
      "key":"admin-official:pgtap-refresh",
      "payload":{
        "kind":"admin_official_url_v1",
        "officialUrl":"https://sponsor.example.test/rules",
        "idempotencyKey":"pgtap:refresh",
        "authority":{
          "type":"sweepza_operator",
          "appUserId":"33333333-3333-4333-8333-333333333333"
        }
      }
    }]'::jsonb,
    'operator_revalidation'
  ),
  0,
  'a pending generation prevents duplicate explicit work'
);

reset role;

update public.source_discovery_work_item
   set completed_at = clock_timestamp() - interval '2 hours'
 where source_id = 'official_direct'
   and item_key = 'admin-official:pgtap-refresh:refresh:2';

set local role service_role;

select is(
  public.enqueue_due_official_url_revalidation_work(25, 3600),
  1,
  'a due successful request queues one scheduled generation'
);

select is(
  (
    select current_generation
    from public.official_url_intake_request
    where request_item_key = 'admin-official:pgtap-refresh'
  ),
  3,
  'scheduled lineage advances exactly once'
);

select is(
  (
    select payload#>>'{refresh,reason}'
    from public.source_discovery_work_item
    where source_id = 'official_direct'
      and item_key = 'admin-official:pgtap-refresh:refresh:3'
  ),
  'scheduled_revalidation',
  'the scheduled generation records its refresh provenance'
);

select is(
  public.enqueue_due_official_url_revalidation_work(25, 3600),
  0,
  'a pending scheduled generation cannot be enqueued twice'
);

select is(
  (
    select count(*)::integer
    from public.source_discovery_work_item
    where source_id = 'official_direct'
      and item_key like 'admin-official:pgtap-refresh%'
  ),
  3,
  'the immutable request has exactly three executable generations'
);

select * from finish();

rollback;
