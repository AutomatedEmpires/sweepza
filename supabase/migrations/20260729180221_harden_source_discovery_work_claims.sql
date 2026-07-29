-- Durable discovery work is claimed atomically and acknowledged with a
-- compare-and-set token. A stale worker can no longer complete a replacement
-- payload after the same generic queue key is refreshed.

alter table public.source_discovery_work_item
  add column claim_token uuid,
  add column claimed_at timestamptz,
  add column claim_expires_at timestamptz,
  add column dead_lettered_at timestamptz,
  add column dead_letter_reason text,
  add column last_failure_reason text;

alter table public.source_discovery_work_item
  add constraint source_discovery_work_claim_fields_consistent
    check (
      (
        claim_token is null
        and claimed_at is null
        and claim_expires_at is null
      )
      or (
        claim_token is not null
        and claimed_at is not null
        and claim_expires_at is not null
        and claim_expires_at > claimed_at
      )
    ),
  add constraint source_discovery_work_dead_letter_fields_consistent
    check (
      (
        dead_lettered_at is null
        and dead_letter_reason is null
      )
      or (
        dead_lettered_at is not null
        and completed_at is not null
        and nullif(btrim(dead_letter_reason), '') is not null
        and char_length(dead_letter_reason) <= 1000
      )
    ),
  add constraint source_discovery_work_last_failure_reason_bounded
    check (
      last_failure_reason is null
      or (
        nullif(btrim(last_failure_reason), '') is not null
        and char_length(last_failure_reason) <= 1000
      )
    );

create index source_discovery_work_claimable_idx
  on public.source_discovery_work_item (
    source_id,
    attempts,
    next_attempt_at,
    claim_expires_at,
    discovered_at,
    item_key
  )
  where completed_at is null;

-- Preserve the generic discovery queues' refresh behavior, but make an exact
-- replay a true no-op and invalidate any in-flight claim whenever the payload
-- changes. The old worker may finish its network work, but its token can no
-- longer acknowledge the new generation.
create or replace function public.enqueue_source_discovery_work(
  p_source_id text,
  p_items jsonb
) returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer := 0;
begin
  if p_source_id = 'official_direct' then
    raise exception using
      errcode = '42501',
      message = 'official_direct_requires_strict_intake_rpc';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'p_items must be a JSON array';
  end if;

  with parsed as (
    select item, ordinal
    from jsonb_array_elements(p_items) with ordinality as entry(item, ordinal)
    where nullif(btrim(item->>'key'), '') is not null
      and jsonb_typeof(item->'payload') = 'object'
  ), deduplicated as (
    select distinct on (item->>'key') item
    from parsed
    order by item->>'key', ordinal desc
  )
  insert into public.source_discovery_work_item as existing (
    source_id,
    item_key,
    payload
  )
  select
    p_source_id,
    item->>'key',
    item->'payload'
  from deduplicated
  on conflict (source_id, item_key) do update
    set payload = excluded.payload,
        completed_at = null,
        attempts = 0,
        next_attempt_at = clock_timestamp(),
        claim_token = null,
        claimed_at = null,
        claim_expires_at = null,
        dead_lettered_at = null,
        dead_letter_reason = null,
        last_failure_reason = null
    where existing.payload is distinct from excluded.payload;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- First-party official URL intake has stricter idempotency than the generic
-- discovery queues. The actor-scoped item key is immutable: the same key and
-- same payload is a no-op, while the same key with different payload aborts
-- the entire batch. A post-insert conflict check also closes the concurrent
-- first-writer race around ON CONFLICT DO NOTHING.
create function public.enqueue_official_url_intake_work(
  p_items jsonb
) returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer := 0;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'p_items must be a JSON array';
  end if;

  if jsonb_array_length(p_items) < 1
     or jsonb_array_length(p_items) > 500 then
    raise exception 'official URL intake requires 1 to 500 items';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_items) as entry(item)
    where jsonb_typeof(item) <> 'object'
       or nullif(btrim(item->>'key'), '') is null
       or char_length(item->>'key') > 256
       or jsonb_typeof(item->'payload') <> 'object'
  ) then
    raise exception 'official URL intake contains an invalid item';
  end if;

  insert into public.source_discovery_work_item (
    source_id,
    item_key,
    payload
  )
  select distinct on (item->>'key')
    'official_direct',
    item->>'key',
    item->'payload'
  from jsonb_array_elements(p_items) with ordinality as entry(item, ordinal)
  order by item->>'key', ordinal
  on conflict (source_id, item_key) do nothing;

  get diagnostics v_count = row_count;

  if exists (
    select 1
    from jsonb_array_elements(p_items) as entry(item)
    join public.source_discovery_work_item as existing
      on existing.source_id = 'official_direct'
     and existing.item_key = item->>'key'
    where existing.payload is distinct from item->'payload'
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'official_url_intake_idempotency_conflict';
  end if;

  return v_count;
end;
$$;

create function public.claim_source_discovery_work(
  p_source_id text,
  p_limit integer,
  p_lease_seconds integer
) returns table (
  item_key text,
  payload jsonb,
  claim_token uuid
)
language sql
security definer
set search_path = ''
as $$
  with exhausted as (
    -- Rows already at the retry ceiling are terminal before the claim window
    -- is selected. They can never consume another bounded worker slot.
    update public.source_discovery_work_item as poison
       set completed_at = clock_timestamp(),
           dead_lettered_at = clock_timestamp(),
           dead_letter_reason = left(
             'retry_exhausted_after_5_attempts'
               || case
                    when poison.last_failure_reason is null then ''
                    else ': ' || poison.last_failure_reason
                  end,
             1000
           ),
           last_failure_reason = null,
           claim_token = null,
           claimed_at = null,
           claim_expires_at = null
     where poison.source_id = p_source_id
       and poison.completed_at is null
       and poison.attempts >= 5
       and poison.next_attempt_at <= clock_timestamp()
       and (
         poison.claim_expires_at is null
         or poison.claim_expires_at <= clock_timestamp()
       )
    returning poison.source_id, poison.item_key
  ), due as (
    select pending.source_id, pending.item_key
    from public.source_discovery_work_item as pending
    where pending.source_id = p_source_id
      and pending.completed_at is null
      and pending.attempts < 5
      and pending.next_attempt_at <= clock_timestamp()
      and (
        pending.claim_expires_at is null
        or pending.claim_expires_at <= clock_timestamp()
      )
    order by
      pending.attempts,
      pending.next_attempt_at,
      pending.discovered_at,
      pending.item_key
    for update skip locked
    limit greatest(0, least(500, coalesce(p_limit, 0)))
  )
  update public.source_discovery_work_item as work
     set claim_token = gen_random_uuid(),
         claimed_at = clock_timestamp(),
         claim_expires_at = clock_timestamp()
           + make_interval(
               secs => greatest(
                 60,
                 least(3600, coalesce(p_lease_seconds, 900))
               )
             )
    from due
   where work.source_id = due.source_id
     and work.item_key = due.item_key
  returning work.item_key, work.payload, work.claim_token;
$$;

create function public.complete_source_discovery_work(
  p_source_id text,
  p_item_key text,
  p_claim_token uuid
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.source_discovery_work_item
     set completed_at = clock_timestamp(),
         last_failure_reason = null,
         claim_token = null,
         claimed_at = null,
         claim_expires_at = null
   where source_id = p_source_id
     and item_key = p_item_key
     and completed_at is null
     and claim_token = p_claim_token;
  return found;
end;
$$;

create function public.defer_source_discovery_work(
  p_source_id text,
  p_item_key text,
  p_claim_token uuid,
  p_reason text
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason text := left(btrim(coalesce(p_reason, '')), 1000);
begin
  if v_reason = '' then
    raise exception 'defer reason is required';
  end if;

  update public.source_discovery_work_item
     set attempts = attempts + 1,
         next_attempt_at = case
           when attempts + 1 >= 5 then clock_timestamp()
           else clock_timestamp()
             + make_interval(
                 mins => least(
                   1440,
                   5 * (2 ^ least(attempts, 8))::integer
                 )
               )
         end,
         completed_at = case
           when attempts + 1 >= 5 then clock_timestamp()
           else null
         end,
         dead_lettered_at = case
           when attempts + 1 >= 5 then clock_timestamp()
           else null
         end,
         dead_letter_reason = case
           when attempts + 1 >= 5 then left(
             'retry_exhausted_after_5_attempts: ' || v_reason,
             1000
           )
           else null
         end,
         last_failure_reason = case
           when attempts + 1 >= 5 then null
           else v_reason
         end,
         claim_token = null,
         claimed_at = null,
         claim_expires_at = null
   where source_id = p_source_id
     and item_key = p_item_key
     and completed_at is null
     and claim_token = p_claim_token;
  return found;
end;
$$;

create function public.dead_letter_source_discovery_work(
  p_source_id text,
  p_item_key text,
  p_claim_token uuid,
  p_reason text
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason text := left(btrim(coalesce(p_reason, '')), 1000);
begin
  if v_reason = '' then
    raise exception 'dead-letter reason is required';
  end if;

  update public.source_discovery_work_item
     set completed_at = clock_timestamp(),
         dead_lettered_at = clock_timestamp(),
         dead_letter_reason = v_reason,
         last_failure_reason = null,
         claim_token = null,
         claimed_at = null,
         claim_expires_at = null
   where source_id = p_source_id
     and item_key = p_item_key
     and completed_at is null
     and claim_token = p_claim_token;
  return found;
end;
$$;

revoke all on function public.enqueue_official_url_intake_work(jsonb)
  from public, anon, authenticated;
revoke all on function public.claim_source_discovery_work(text, integer, integer)
  from public, anon, authenticated;
revoke all on function public.complete_source_discovery_work(text, text, uuid)
  from public, anon, authenticated;
revoke all on function public.defer_source_discovery_work(text, text, uuid, text)
  from public, anon, authenticated;
revoke all on function public.dead_letter_source_discovery_work(text, text, uuid, text)
  from public, anon, authenticated;

grant execute on function public.enqueue_official_url_intake_work(jsonb)
  to service_role;
grant execute on function public.claim_source_discovery_work(text, integer, integer)
  to service_role;
grant execute on function public.complete_source_discovery_work(text, text, uuid)
  to service_role;
grant execute on function public.defer_source_discovery_work(text, text, uuid, text)
  to service_role;
grant execute on function public.dead_letter_source_discovery_work(text, text, uuid, text)
  to service_role;

-- The claim-aware RPCs are the only worker mutation boundary. Leaving either
-- the legacy key-only defer overload or direct table UPDATE available would
-- preserve an unversioned path that can acknowledge replacement work.
drop function public.defer_source_discovery_work(text, text);
revoke update on table public.source_discovery_work_item from service_role;

comment on function public.enqueue_official_url_intake_work(jsonb) is
  'Strict immutable idempotency boundary for authenticated official URL intake. Service role only.';
comment on function public.claim_source_discovery_work(text, integer, integer) is
  'Atomically claims due discovery work with a bounded lease and CAS token. Service role only.';
comment on function public.complete_source_discovery_work(text, text, uuid) is
  'Completes only the currently claimed discovery-work generation. Service role only.';
comment on function public.defer_source_discovery_work(text, text, uuid, text) is
  'Defers only the currently claimed discovery-work generation with bounded diagnostics; the fifth failure is terminally quarantined. Service role only.';
comment on function public.dead_letter_source_discovery_work(text, text, uuid, text) is
  'Terminally quarantines malformed, denied, or otherwise permanent discovery work with a persisted diagnostic. Service role only.';
