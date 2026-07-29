-- Keep the caller's immutable request identity separate from each executable
-- validation generation. A completed queue row is never reopened or mutated:
-- explicit and scheduled refreshes create a new item key and therefore retain
-- the claim-token compare-and-set boundary from the original generation.

create table public.official_url_intake_request (
  request_item_key text primary key,
  request_payload jsonb not null,
  current_generation integer not null default 1,
  latest_work_item_key text not null,
  first_queued_at timestamptz not null default now(),
  last_queued_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint official_url_intake_request_key_bounded
    check (
      nullif(btrim(request_item_key), '') is not null
      and char_length(request_item_key) <= 256
    ),
  constraint official_url_intake_request_payload_object
    check (
      jsonb_typeof(request_payload) = 'object'
      and request_payload->>'kind' = 'admin_official_url_v1'
      and not (request_payload ? 'refresh')
    ),
  constraint official_url_intake_request_generation_positive
    check (current_generation >= 1),
  constraint official_url_intake_latest_key_matches_generation
    check (
      latest_work_item_key = case
        when current_generation = 1 then request_item_key
        else request_item_key || ':refresh:' || current_generation::text
      end
      and char_length(latest_work_item_key) <= 256
    )
);

create index official_url_intake_request_schedule_idx
  on public.official_url_intake_request (last_queued_at, request_item_key);

create trigger official_url_intake_request_set_updated_at
  before update on public.official_url_intake_request
  for each row execute function public.set_updated_at();

alter table public.official_url_intake_request enable row level security;

create policy official_url_intake_request_admin_read
  on public.official_url_intake_request
  for select
  using (private.is_admin() or private.is_owner());

grant select on public.official_url_intake_request to authenticated;
revoke insert, update, delete, truncate
  on public.official_url_intake_request
  from public, anon, authenticated, service_role;

-- Existing immutable intake rows are generation one. Only root rows are
-- backfilled; generated refresh rows are created by the functions below.
insert into public.official_url_intake_request (
  request_item_key,
  request_payload,
  current_generation,
  latest_work_item_key,
  first_queued_at,
  last_queued_at
)
select
  work.item_key,
  work.payload,
  1,
  work.item_key,
  work.discovered_at,
  work.discovered_at
from public.source_discovery_work_item as work
where work.source_id = 'official_direct'
  and nullif(btrim(work.item_key), '') is not null
  and char_length(work.item_key) <= 256
  and jsonb_typeof(work.payload) = 'object'
  and work.payload->>'kind' = 'admin_official_url_v1'
  and not (work.payload ? 'refresh')
on conflict (request_item_key) do nothing;

-- Exact request replay remains immutable. The root queue row and lineage row
-- are inserted together; the same key plus the same payload is a no-op, while
-- any changed payload aborts the entire batch.
create or replace function public.enqueue_official_url_intake_work(
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
       or item->'payload'->>'kind' <> 'admin_official_url_v1'
       or (item->'payload') ? 'refresh'
  ) then
    raise exception 'official URL intake contains an invalid item';
  end if;

  if (
    select count(*) <> count(distinct item->>'key')
    from jsonb_array_elements(p_items) as entry(item)
  ) then
    raise exception 'official URL intake contains duplicate keys';
  end if;

  with inserted as (
    insert into public.source_discovery_work_item (
      source_id,
      item_key,
      payload
    )
    select
      'official_direct',
      item->>'key',
      item->'payload'
    from jsonb_array_elements(p_items) as entry(item)
    on conflict (source_id, item_key) do nothing
    returning item_key
  )
  select count(*)::integer into v_count from inserted;

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

  insert into public.official_url_intake_request (
    request_item_key,
    request_payload,
    current_generation,
    latest_work_item_key
  )
  select
    item->>'key',
    item->'payload',
    1,
    item->>'key'
  from jsonb_array_elements(p_items) as entry(item)
  on conflict (request_item_key) do nothing;

  if exists (
    select 1
    from jsonb_array_elements(p_items) as entry(item)
    join public.official_url_intake_request as existing
      on existing.request_item_key = item->>'key'
    where existing.request_payload is distinct from item->'payload'
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'official_url_intake_idempotency_conflict';
  end if;

  return v_count;
end;
$$;

-- Explicit revalidation requires an existing exact request. It never converts
-- a new URL into implicit work and never creates a second generation while the
-- latest one is still pending or claimed.
create function public.revalidate_official_url_intake_work(
  p_items jsonb,
  p_reason text
) returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer := 0;
  v_request record;
  v_latest_completed_at timestamptz;
  v_new_key text;
  v_next_generation integer;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'p_items must be a JSON array';
  end if;

  if jsonb_array_length(p_items) < 1
     or jsonb_array_length(p_items) > 500 then
    raise exception 'official URL revalidation requires 1 to 500 items';
  end if;

  if p_reason <> 'operator_revalidation' then
    raise exception 'unsupported official URL revalidation reason';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_items) as entry(item)
    where jsonb_typeof(item) <> 'object'
       or nullif(btrim(item->>'key'), '') is null
       or char_length(item->>'key') > 256
       or jsonb_typeof(item->'payload') <> 'object'
       or item->'payload'->>'kind' <> 'admin_official_url_v1'
       or (item->'payload') ? 'refresh'
  ) then
    raise exception 'official URL revalidation contains an invalid item';
  end if;

  if (
    select count(*) <> count(distinct item->>'key')
    from jsonb_array_elements(p_items) as entry(item)
  ) then
    raise exception 'official URL revalidation contains duplicate keys';
  end if;

  -- Lock every immutable request in a deterministic order. Concurrent
  -- operator/scheduler calls can therefore advance each request only once.
  perform lineage.request_item_key
  from public.official_url_intake_request as lineage
  join jsonb_array_elements(p_items) as entry(item)
    on lineage.request_item_key = item->>'key'
  order by lineage.request_item_key
  for update of lineage;

  if exists (
    select 1
    from jsonb_array_elements(p_items) as entry(item)
    left join public.official_url_intake_request as lineage
      on lineage.request_item_key = item->>'key'
    where lineage.request_item_key is null
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'official_url_intake_revalidation_not_found';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_items) as entry(item)
    join public.official_url_intake_request as lineage
      on lineage.request_item_key = item->>'key'
    where lineage.request_payload is distinct from item->'payload'
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'official_url_intake_idempotency_conflict';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_items) as entry(item)
    join public.official_url_intake_request as lineage
      on lineage.request_item_key = item->>'key'
    left join public.source_discovery_work_item as work
      on work.source_id = 'official_direct'
     and work.item_key = lineage.latest_work_item_key
    where work.item_key is null
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'official_url_intake_revalidation_state_invalid';
  end if;

  for v_request in
    select lineage.*
    from public.official_url_intake_request as lineage
    join jsonb_array_elements(p_items) as entry(item)
      on lineage.request_item_key = item->>'key'
    order by lineage.request_item_key
  loop
    select work.completed_at
      into v_latest_completed_at
    from public.source_discovery_work_item as work
    where work.source_id = 'official_direct'
      and work.item_key = v_request.latest_work_item_key;

    if v_latest_completed_at is null then
      continue;
    end if;

    if v_request.current_generation >= 2147483647 then
      raise exception 'official URL revalidation generation exhausted';
    end if;

    v_next_generation := v_request.current_generation + 1;
    v_new_key :=
      v_request.request_item_key || ':refresh:' || v_next_generation::text;
    if char_length(v_new_key) > 256 then
      raise exception 'official URL revalidation key exceeds 256 characters';
    end if;

    insert into public.source_discovery_work_item (
      source_id,
      item_key,
      payload
    ) values (
      'official_direct',
      v_new_key,
      v_request.request_payload || jsonb_build_object(
        'refresh',
        jsonb_build_object(
          'requestItemKey', v_request.request_item_key,
          'generation', v_next_generation,
          'reason', p_reason
        )
      )
    );

    update public.official_url_intake_request
       set current_generation = v_next_generation,
           latest_work_item_key = v_new_key,
           last_queued_at = clock_timestamp()
     where request_item_key = v_request.request_item_key;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

-- The twice-daily runner can enqueue only completed, successful, old-enough
-- requests. SKIP LOCKED plus the lineage row lock prevents overlapping cron
-- invocations from producing duplicate generations.
create function public.enqueue_due_official_url_revalidation_work(
  p_limit integer,
  p_min_age_seconds integer
) returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer := 0;
  v_request record;
  v_new_key text;
  v_next_generation integer;
begin
  if p_limit is null or p_limit < 0 or p_limit > 500 then
    raise exception 'official URL revalidation limit must be between 0 and 500';
  end if;

  if p_min_age_seconds is null
     or p_min_age_seconds < 3600
     or p_min_age_seconds > 31536000 then
    raise exception 'official URL revalidation age must be between 3600 and 31536000 seconds';
  end if;

  for v_request in
    select lineage.*
    from public.official_url_intake_request as lineage
    join public.source_discovery_work_item as work
      on work.source_id = 'official_direct'
     and work.item_key = lineage.latest_work_item_key
    where work.completed_at is not null
      and work.dead_lettered_at is null
      and work.completed_at <=
        clock_timestamp() - make_interval(secs => p_min_age_seconds)
    order by work.completed_at, lineage.request_item_key
    for update of lineage skip locked
    limit p_limit
  loop
    if v_request.current_generation >= 2147483647 then
      raise exception 'official URL revalidation generation exhausted';
    end if;

    v_next_generation := v_request.current_generation + 1;
    v_new_key :=
      v_request.request_item_key || ':refresh:' || v_next_generation::text;
    if char_length(v_new_key) > 256 then
      raise exception 'official URL revalidation key exceeds 256 characters';
    end if;

    insert into public.source_discovery_work_item (
      source_id,
      item_key,
      payload
    ) values (
      'official_direct',
      v_new_key,
      v_request.request_payload || jsonb_build_object(
        'refresh',
        jsonb_build_object(
          'requestItemKey', v_request.request_item_key,
          'generation', v_next_generation,
          'reason', 'scheduled_revalidation'
        )
      )
    );

    update public.official_url_intake_request
       set current_generation = v_next_generation,
           latest_work_item_key = v_new_key,
           last_queued_at = clock_timestamp()
     where request_item_key = v_request.request_item_key;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.revalidate_official_url_intake_work(jsonb, text)
  from public, anon, authenticated;
revoke all on function public.enqueue_due_official_url_revalidation_work(integer, integer)
  from public, anon, authenticated;

grant execute on function public.revalidate_official_url_intake_work(jsonb, text)
  to service_role;
grant execute on function public.enqueue_due_official_url_revalidation_work(integer, integer)
  to service_role;

comment on table public.official_url_intake_request is
  'Immutable official URL intake request identity and its latest executable validation generation.';
comment on function public.enqueue_official_url_intake_work(jsonb) is
  'Queues generation one exactly once and records immutable request lineage. Service role only.';
comment on function public.revalidate_official_url_intake_work(jsonb, text) is
  'Queues a fresh generation for completed exact official URL requests without reopening prior CAS work. Service role only.';
comment on function public.enqueue_due_official_url_revalidation_work(integer, integer) is
  'Queues one fresh generation for each due successful official URL request, with overlap-safe lineage locks. Service role only.';
