begin;

select plan(26);

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

select ok(
  has_function_privilege(
    'service_role',
    'public.defer_source_discovery_work(text,text,uuid,text)',
    'EXECUTE'
  ),
  'service role can defer a CAS claim with a bounded diagnostic'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.defer_source_discovery_work(text,text,uuid,text)',
    'EXECUTE'
  ),
  'anonymous callers cannot mutate retry state'
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

select ok(
  to_regprocedure(
    'public.defer_source_discovery_work(text,text,uuid)'
  ) is null,
  'defer requires a bounded failure diagnostic as well as the CAS token'
);

-- A cohort that already exhausted retries must be quarantined before the
-- bounded claim window is selected, not returned as the first 25 rows forever.
update public.source_discovery_work_item
   set completed_at = clock_timestamp()
 where source_id = 'sweeps_advantage'
   and item_key = 'pgtap-generic-source';

insert into public.source_discovery_work_item (
  source_id,
  item_key,
  payload,
  discovered_at,
  attempts,
  next_attempt_at
)
select
  'sweeps_advantage',
  'pgtap-poison-' || lpad(series::text, 2, '0'),
  '{}'::jsonb,
  clock_timestamp() - interval '2 days',
  5,
  clock_timestamp() - interval '1 day'
from generate_series(1, 25) as series;

insert into public.source_discovery_work_item (
  source_id,
  item_key,
  payload,
  attempts,
  next_attempt_at
) values (
  'sweeps_advantage',
  'pgtap-fresh-after-poison',
  '{}'::jsonb,
  0,
  clock_timestamp()
);

set local role service_role;

select results_eq(
  $$
    select item_key
      from public.claim_source_discovery_work(
        'sweeps_advantage',
        25,
        900
      )
     order by item_key
  $$,
  array['pgtap-fresh-after-poison']::text[],
  'retry-exhausted poison cannot consume any slot in a 25-item run'
);

reset role;

select is(
  (
    select count(*)::integer
      from public.source_discovery_work_item
     where source_id = 'sweeps_advantage'
       and item_key like 'pgtap-poison-%'
       and dead_lettered_at is not null
  ),
  25,
  'claim atomically quarantines the exhausted poison cohort'
);

update public.source_discovery_work_item
   set completed_at = clock_timestamp(),
       claim_token = null,
       claimed_at = null,
       claim_expires_at = null
 where source_id = 'sweeps_advantage'
   and item_key = 'pgtap-fresh-after-poison';

-- Retried work remains eligible, but never-attempted work receives the bounded
-- worker slot first even when the retry cohort is older and already due.
insert into public.source_discovery_work_item (
  source_id,
  item_key,
  payload,
  discovered_at,
  attempts,
  next_attempt_at,
  last_failure_reason
)
select
  'sweeps_advantage',
  'pgtap-retry-' || lpad(series::text, 2, '0'),
  '{}'::jsonb,
  clock_timestamp() - interval '2 days',
  1,
  clock_timestamp() - interval '1 day',
  'transient network failure'
from generate_series(1, 25) as series;

insert into public.source_discovery_work_item (
  source_id,
  item_key,
  payload,
  attempts,
  next_attempt_at
) values (
  'sweeps_advantage',
  'pgtap-never-attempted',
  '{}'::jsonb,
  0,
  clock_timestamp()
);

set local role service_role;

select results_eq(
  $$
    select item_key
      from public.claim_source_discovery_work(
        'sweeps_advantage',
        1,
        900
      )
  $$,
  array['pgtap-never-attempted']::text[],
  'due retries cannot starve never-attempted work'
);

reset role;

-- The fifth retry is terminal and retains only a bounded diagnostic.
insert into public.source_discovery_work_item (
  source_id,
  item_key,
  payload,
  attempts,
  next_attempt_at
) values (
  'freebie_guy',
  'pgtap-final-retry',
  '{}'::jsonb,
  4,
  clock_timestamp()
);

set local role service_role;

select results_eq(
  $$
    select item_key
      from public.claim_source_discovery_work(
        'freebie_guy',
        1,
        900
      )
  $$,
  array['pgtap-final-retry']::text[],
  'the final allowed retry can still be claimed'
);

select is(
  public.defer_source_discovery_work(
    'freebie_guy',
    'pgtap-final-retry',
    (
      select claim_token
        from public.source_discovery_work_item
       where source_id = 'freebie_guy'
         and item_key = 'pgtap-final-retry'
    ),
    repeat('provider unavailable ', 100)
  ),
  true,
  'the CAS-bound fifth defer succeeds'
);

reset role;

select is(
  (
    select attempts
      from public.source_discovery_work_item
     where source_id = 'freebie_guy'
       and item_key = 'pgtap-final-retry'
  ),
  5,
  'the retry ceiling is persisted exactly'
);

select ok(
  (
    select completed_at is not null
       and dead_lettered_at is not null
       and dead_letter_reason like 'retry_exhausted_after_5_attempts:%'
      from public.source_discovery_work_item
     where source_id = 'freebie_guy'
       and item_key = 'pgtap-final-retry'
  ),
  'the fifth failure moves work to terminal quarantine'
);

select is(
  (
    select char_length(dead_letter_reason)
      from public.source_discovery_work_item
     where source_id = 'freebie_guy'
       and item_key = 'pgtap-final-retry'
  ),
  1000,
  'retry-exhaustion diagnostics remain bounded'
);

-- Once an expired lease is reclaimed, every mutation from the prior worker
-- must lose its compare-and-set without disturbing the current lease.
insert into public.source_discovery_work_item (
  source_id,
  item_key,
  payload,
  attempts,
  next_attempt_at
) values (
  'sweepstakes_today',
  'pgtap-reclaimed-claim',
  '{}'::jsonb,
  0,
  clock_timestamp()
);

set local role service_role;

select results_eq(
  $$
    select item_key
      from public.claim_source_discovery_work(
        'sweepstakes_today',
        1,
        60
      )
  $$,
  array['pgtap-reclaimed-claim']::text[],
  'work receives an initial lease'
);

reset role;

create temporary table pgtap_reclaimed_claim_tokens (
  stale_token uuid not null,
  current_token uuid
);

insert into pgtap_reclaimed_claim_tokens (stale_token)
select claim_token
  from public.source_discovery_work_item
 where source_id = 'sweepstakes_today'
   and item_key = 'pgtap-reclaimed-claim';

grant select on pgtap_reclaimed_claim_tokens to service_role;

update public.source_discovery_work_item
   set claimed_at = clock_timestamp() - interval '61 seconds',
       claim_expires_at = clock_timestamp() - interval '1 second'
 where source_id = 'sweepstakes_today'
   and item_key = 'pgtap-reclaimed-claim';

set local role service_role;

select results_eq(
  $$
    select item_key
      from public.claim_source_discovery_work(
        'sweepstakes_today',
        1,
        60
      )
  $$,
  array['pgtap-reclaimed-claim']::text[],
  'expired work receives a new lease'
);

reset role;

update pgtap_reclaimed_claim_tokens
   set current_token = (
     select claim_token
       from public.source_discovery_work_item
      where source_id = 'sweepstakes_today'
        and item_key = 'pgtap-reclaimed-claim'
   );

set local role service_role;

select is(
  public.complete_source_discovery_work(
    'sweepstakes_today',
    'pgtap-reclaimed-claim',
    (select stale_token from pg_temp.pgtap_reclaimed_claim_tokens)
  ),
  false,
  'a stale claim cannot complete reclaimed work'
);

select is(
  public.defer_source_discovery_work(
    'sweepstakes_today',
    'pgtap-reclaimed-claim',
    (select stale_token from pg_temp.pgtap_reclaimed_claim_tokens),
    'stale worker retry'
  ),
  false,
  'a stale claim cannot defer reclaimed work'
);

select is(
  public.dead_letter_source_discovery_work(
    'sweepstakes_today',
    'pgtap-reclaimed-claim',
    (select stale_token from pg_temp.pgtap_reclaimed_claim_tokens),
    'stale worker terminal result'
  ),
  false,
  'a stale claim cannot dead-letter reclaimed work'
);

select is(
  public.complete_source_discovery_work(
    'sweepstakes_today',
    'pgtap-reclaimed-claim',
    (select current_token from pg_temp.pgtap_reclaimed_claim_tokens)
  ),
  true,
  'the current claim retains authority after stale mutations fail'
);

select * from finish();

rollback;
