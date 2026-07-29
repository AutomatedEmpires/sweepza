-- Operator telemetry must come from one PostgreSQL statement so queue workers
-- cannot make independent count and oldest-row reads disagree.

create function public.get_official_url_intake_backlog_status()
returns table (
  pending bigint,
  retrying bigint,
  completed bigint,
  dead_lettered bigint,
  oldest_pending_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    count(*) filter (
      where work.completed_at is null
        and work.attempts = 0
    ) as pending,
    count(*) filter (
      where work.completed_at is null
        and work.attempts > 0
    ) as retrying,
    count(*) filter (
      where work.completed_at is not null
        and work.dead_lettered_at is null
    ) as completed,
    count(*) filter (
      where work.dead_lettered_at is not null
    ) as dead_lettered,
    min(work.discovered_at) filter (
      where work.completed_at is null
    ) as oldest_pending_at
  from public.source_discovery_work_item as work
  where work.source_id = 'official_direct';
$$;

revoke all on function public.get_official_url_intake_backlog_status()
  from public, anon, authenticated;
grant execute on function public.get_official_url_intake_backlog_status()
  to service_role;

comment on function public.get_official_url_intake_backlog_status() is
  'Returns one aggregate-only official intake queue snapshot. Service role only.';
