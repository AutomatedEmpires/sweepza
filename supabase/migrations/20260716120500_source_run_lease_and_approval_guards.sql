-- Make source execution and approval transitions database-authoritative.
--
-- The application gate is still the first, fail-closed policy check, but two
-- serverless invocations can both read the same due/healthy row. A per-source
-- lease acquired under a row lock is the final authority for cadence and
-- concurrency. Approval legality is enforced here too: callers may explain a
-- transition, but cannot manufacture an illegal history or approval metadata.

alter table public.source_registry
  add column active_run_token uuid,
  add column active_run_started_at timestamptz,
  add column active_run_expires_at timestamptz,
  add constraint source_registry_run_lease_complete check (
    (active_run_token is null and active_run_started_at is null and active_run_expires_at is null)
    or
    (active_run_token is not null and active_run_started_at is not null
      and active_run_expires_at is not null
      and active_run_expires_at > active_run_started_at)
  ),
  add constraint source_registry_approval_attribution check (
    (compliance_state = 'approved_for_production' and approved_by is not null and approved_at is not null)
    or
    (compliance_state <> 'approved_for_production' and approved_by is null and approved_at is null)
  );

alter table public.source_approval_event
  add constraint source_approval_event_actor_present check (btrim(actor) <> '');

-- Superseded by token-bound finish_source_run_lease below. Leaving this RPC
-- callable would preserve a bypass for stale, unleased outcome writes.
drop function public.record_source_run_outcome(text, boolean, text, integer);

create or replace function private.source_transition_is_legal(
  p_from public.source_compliance_state,
  p_to public.source_compliance_state
) returns boolean
language sql
immutable
security invoker
set search_path = ''
as $$
  select case p_from
    when 'draft' then p_to = any (array['research_required','reviewed','blocked']::public.source_compliance_state[])
    when 'research_required' then p_to = any (array['reviewed','draft','blocked']::public.source_compliance_state[])
    when 'reviewed' then p_to = any (array['approved_for_fixtures','research_required','blocked']::public.source_compliance_state[])
    when 'approved_for_fixtures' then p_to = any (array['approved_for_manual_check','reviewed','paused','blocked','revoked']::public.source_compliance_state[])
    when 'approved_for_manual_check' then p_to = any (array['approved_for_production','approved_for_fixtures','paused','blocked','revoked']::public.source_compliance_state[])
    when 'approved_for_production' then p_to = any (array['paused','blocked','revoked']::public.source_compliance_state[])
    when 'paused' then p_to = any (array['approved_for_fixtures','approved_for_manual_check','approved_for_production','blocked','revoked']::public.source_compliance_state[])
    when 'blocked' then p_to = any (array['research_required','revoked']::public.source_compliance_state[])
    when 'revoked' then false
    else false
  end;
$$;

drop function public.transition_source_compliance(
  text, public.source_compliance_state, public.source_compliance_state, text, text, boolean
);

create function public.transition_source_compliance(
  p_source_id text,
  p_from public.source_compliance_state,
  p_to public.source_compliance_state,
  p_actor text,
  p_reason text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current public.source_compliance_state;
  v_actor text := btrim(p_actor);
begin
  if p_actor is null or v_actor = '' then
    return jsonb_build_object('ok', false, 'error', 'actor_required');
  end if;

  select compliance_state into v_current
    from public.source_registry
   where id = p_source_id
     for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'unknown_source');
  end if;
  if v_current is distinct from p_from then
    return jsonb_build_object('ok', false, 'error', 'stale_state', 'actual', v_current);
  end if;
  if p_to is null then
    return jsonb_build_object('ok', false, 'error', 'illegal_transition');
  end if;
  if not private.source_transition_is_legal(v_current, p_to) then
    return jsonb_build_object('ok', false, 'error', 'illegal_transition');
  end if;

  insert into public.source_approval_event (source_id, from_state, to_state, actor, reason)
  values (p_source_id, v_current, p_to, v_actor, p_reason);

  update public.source_registry
     set compliance_state = p_to,
         approved_by = case when p_to = 'approved_for_production' then v_actor else null end,
         approved_at = case when p_to = 'approved_for_production' then clock_timestamp() else null end,
         active_run_token = case when p_to = 'approved_for_production' then active_run_token else null end,
         active_run_started_at = case when p_to = 'approved_for_production' then active_run_started_at else null end,
         active_run_expires_at = case when p_to = 'approved_for_production' then active_run_expires_at else null end
   where id = p_source_id;

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.acquire_source_run_lease(
  p_source_id text,
  p_refresh_interval_minutes integer,
  p_lease_seconds integer default 600
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source public.source_registry%rowtype;
  v_now timestamptz := clock_timestamp();
  v_token uuid := gen_random_uuid();
begin
  if p_refresh_interval_minutes is null
     or p_lease_seconds is null
     or p_refresh_interval_minutes < 0
     or p_lease_seconds < 30
     or p_lease_seconds > 3600 then
    return jsonb_build_object('ok', false, 'error', 'invalid_policy');
  end if;

  select * into v_source
    from public.source_registry
   where id = p_source_id
     for update;

  if not found then return jsonb_build_object('ok', false, 'error', 'unknown_source'); end if;
  if v_source.compliance_state <> 'approved_for_production' then
    return jsonb_build_object('ok', false, 'error', 'not_approved');
  end if;
  if v_source.kill_switch then return jsonb_build_object('ok', false, 'error', 'kill_switch'); end if;
  if v_source.circuit_opened_at is not null then
    return jsonb_build_object('ok', false, 'error', 'circuit_open');
  end if;
  if v_source.active_run_token is not null and v_source.active_run_expires_at > v_now then
    return jsonb_build_object(
      'ok', false, 'error', 'already_running', 'expires_at', v_source.active_run_expires_at
    );
  end if;
  if v_source.last_run_at is not null
     and v_source.last_run_at + make_interval(mins => p_refresh_interval_minutes) > v_now then
    return jsonb_build_object(
      'ok', false, 'error', 'refresh_not_due',
      'next_run_at', v_source.last_run_at + make_interval(mins => p_refresh_interval_minutes)
    );
  end if;

  update public.source_registry
     set active_run_token = v_token,
         active_run_started_at = v_now,
         active_run_expires_at = v_now + make_interval(secs => p_lease_seconds)
   where id = p_source_id;

  return jsonb_build_object(
    'ok', true, 'token', v_token,
    'started_at', v_now,
    'expires_at', v_now + make_interval(secs => p_lease_seconds)
  );
end;
$$;

create or replace function public.finish_source_run_lease(
  p_source_id text,
  p_token uuid,
  p_ok boolean,
  p_failure_class text,
  p_failure_threshold integer
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source public.source_registry%rowtype;
  v_now timestamptz := clock_timestamp();
begin
  if p_ok is null or p_failure_threshold is null or p_failure_threshold < 1 then
    return jsonb_build_object('ok', false, 'error', 'invalid_outcome');
  end if;

  select * into v_source
    from public.source_registry
   where id = p_source_id
     for update;

  if not found then return jsonb_build_object('ok', false, 'error', 'unknown_source'); end if;
  if p_token is null or v_source.active_run_token is null
     or v_source.active_run_token is distinct from p_token then
    return jsonb_build_object('ok', false, 'error', 'stale_lease');
  end if;
  if v_source.active_run_expires_at <= v_now then
    update public.source_registry
       set active_run_token = null, active_run_started_at = null, active_run_expires_at = null
     where id = p_source_id;
    return jsonb_build_object('ok', false, 'error', 'expired_lease');
  end if;

  update public.source_registry
     set last_run_at = v_source.active_run_started_at,
         last_success_at = case when p_ok then v_now else last_success_at end,
         last_failure_at = case when p_ok then last_failure_at else v_now end,
         last_failure_class = case when p_ok then null else p_failure_class end,
         consecutive_failures = case when p_ok then 0 else consecutive_failures + 1 end,
         circuit_opened_at = case
           when p_ok then null
           when consecutive_failures + 1 >= greatest(p_failure_threshold, 1)
             then coalesce(circuit_opened_at, v_now)
           else null
         end,
         active_run_token = null,
         active_run_started_at = null,
         active_run_expires_at = null
   where id = p_source_id;

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.release_source_run_lease(
  p_source_id text,
  p_token uuid
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_token is null then return false; end if;
  update public.source_registry
     set active_run_token = null,
         active_run_started_at = null,
         active_run_expires_at = null
   where id = p_source_id
     and active_run_token = p_token;
  return found;
end;
$$;

comment on function public.acquire_source_run_lease(text, integer, integer) is
  'Atomically enforces source approval, kill switch, circuit state, refresh cadence, and one active run.';
comment on function public.finish_source_run_lease(text, uuid, boolean, text, integer) is
  'Finishes only the matching unexpired source run lease and atomically records breaker health.';
comment on function public.release_source_run_lease(text, uuid) is
  'Abandons only the matching source lease before network execution, without consuming cadence or writing health.';
comment on function public.transition_source_compliance(text, public.source_compliance_state, public.source_compliance_state, text, text) is
  'Atomically validates and records a legal source compliance transition; approval attribution is derived in the database.';

revoke all on function public.acquire_source_run_lease(text, integer, integer) from public, anon, authenticated;
revoke all on function public.finish_source_run_lease(text, uuid, boolean, text, integer) from public, anon, authenticated;
revoke all on function public.release_source_run_lease(text, uuid) from public, anon, authenticated;
revoke all on function public.transition_source_compliance(text, public.source_compliance_state, public.source_compliance_state, text, text) from public, anon, authenticated;
grant execute on function public.acquire_source_run_lease(text, integer, integer) to service_role;
grant execute on function public.finish_source_run_lease(text, uuid, boolean, text, integer) to service_role;
grant execute on function public.release_source_run_lease(text, uuid) to service_role;
grant execute on function public.transition_source_compliance(text, public.source_compliance_state, public.source_compliance_state, text, text) to service_role;

-- Operational writes use narrow RPCs. The service role may read records and
-- flip the emergency kill switch, but cannot fabricate approval events or edit
-- compliance/health/lease columns directly.
revoke insert, update, delete on public.source_approval_event from service_role;
grant select on public.source_approval_event to service_role;
revoke insert, update, delete on public.source_registry from service_role;
grant select on public.source_registry to service_role;
grant update (kill_switch, notes) on public.source_registry to service_role;
