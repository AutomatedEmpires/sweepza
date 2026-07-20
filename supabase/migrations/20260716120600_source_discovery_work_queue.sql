-- Durable discovery backlog. Parent archive validators are safe to commit only
-- after every parsed child is represented here; later runs can receive 304 and
-- still drain the remaining work instead of losing everything after a batch.

create table public.source_discovery_work_item (
  source_id text not null references public.source_registry(id) on delete cascade,
  item_key text not null,
  payload jsonb not null,
  discovered_at timestamptz not null default now(),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (source_id, item_key),
  constraint source_discovery_work_item_payload_object check (jsonb_typeof(payload) = 'object')
);

create index source_discovery_work_pending_idx
  on public.source_discovery_work_item (source_id, next_attempt_at, discovered_at, item_key)
  where completed_at is null;

create trigger source_discovery_work_set_updated_at
  before update on public.source_discovery_work_item
  for each row execute function public.set_updated_at();

alter table public.source_discovery_work_item enable row level security;
create policy source_discovery_work_admin_read
  on public.source_discovery_work_item for select
  using (private.is_admin() or private.is_owner());
grant select on public.source_discovery_work_item to authenticated;
grant select, update on public.source_discovery_work_item to service_role;

create function public.enqueue_source_discovery_work(
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
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'p_items must be a JSON array';
  end if;

  with parsed as (
    select item, ordinal
    from jsonb_array_elements(p_items) with ordinality as entry(item, ordinal)
    where nullif(btrim(item->>'key'), '') is not null
      and jsonb_typeof(item->'payload') = 'object'
  ), deduplicated as (
    -- Broken/duplicated source markup must not make one ON CONFLICT statement
    -- target the same row twice. The last representation wins deterministically.
    select distinct on (item->>'key') item
    from parsed
    order by item->>'key', ordinal desc
  )
  insert into public.source_discovery_work_item as existing (
    source_id, item_key, payload
  )
  select
    p_source_id,
    item->>'key',
    item->'payload'
  from deduplicated
  on conflict (source_id, item_key) do update
    set payload = excluded.payload,
        -- A materially changed child is new work. Identical parent snapshots
        -- keep terminal items closed and do not churn the catalog.
        completed_at = case
          when existing.payload is distinct from excluded.payload then null
          else existing.completed_at
        end,
        attempts = case
          when existing.payload is distinct from excluded.payload then 0
          else existing.attempts
        end,
        next_attempt_at = case
          when existing.payload is distinct from excluded.payload then clock_timestamp()
          else existing.next_attempt_at
        end;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.enqueue_source_discovery_work(text, jsonb)
  from public, anon, authenticated;
grant execute on function public.enqueue_source_discovery_work(text, jsonb)
  to service_role;

create function public.defer_source_discovery_work(
  p_source_id text,
  p_item_key text
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.source_discovery_work_item
     set attempts = attempts + 1,
         next_attempt_at = clock_timestamp()
           + make_interval(mins => least(1440, 5 * (2 ^ least(attempts, 8))::integer))
   where source_id = p_source_id
     and item_key = p_item_key
     and completed_at is null;
  return found;
end;
$$;

revoke all on function public.defer_source_discovery_work(text, text)
  from public, anon, authenticated;
grant execute on function public.defer_source_discovery_work(text, text)
  to service_role;

comment on table public.source_discovery_work_item is
  'Durable child-item backlog populated before a discovery archive ETag is acknowledged.';
