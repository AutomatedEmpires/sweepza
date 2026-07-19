-- Compliance transitions must be ONE atomic decision.
--
-- transitionSourceCompliance() did two independent writes: insert the audit
-- event, then update the registry. If the update failed, the append-only log
-- permanently claimed a transition that never happened — an audit trail that
-- lies is worse than none, because it is trusted. And the read-then-write had
-- no lock, so two concurrent transitions could both validate against the same
-- from_state and produce an illegal history (e.g. two "from reviewed" events).
--
-- The compliance state machine deliberately stays in TypeScript
-- (lib/ingestion/compliance.ts) — duplicating the transition table here would
-- create a second source of truth that silently drifts. So the caller validates
-- legality and passes the from_state it validated against; this function locks
-- the row, COMPARE-AND-SETs on that state, and writes both rows in one
-- transaction. A concurrent mover loses the CAS and is refused rather than
-- writing history for a transition that never happened.

create or replace function public.transition_source_compliance(
  p_source_id text,
  p_from      public.source_compliance_state,
  p_to        public.source_compliance_state,
  p_actor     text,
  p_reason    text,
  p_approving boolean
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current public.source_compliance_state;
begin
  -- FOR UPDATE: serialize concurrent transitions of the same source.
  select compliance_state into v_current
    from public.source_registry
   where id = p_source_id
     for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'unknown_source');
  end if;

  if v_current is distinct from p_from then
    return jsonb_build_object(
      'ok', false,
      'error', 'stale_state',
      'actual', v_current
    );
  end if;

  -- Both writes, one transaction. If the update raises, the event is rolled
  -- back with it and the log never claims an approval that did not land.
  insert into public.source_approval_event (source_id, from_state, to_state, actor, reason)
  values (p_source_id, p_from, p_to, p_actor, p_reason);

  update public.source_registry
     set compliance_state = p_to,
         -- Approval attribution reflects the live production grant specifically;
         -- cleared on the way down so a paused source never reads as
         -- "approved by X" while it is not, in fact, approved.
         approved_by = case when p_approving then p_actor else null end,
         approved_at = case when p_approving then now() else null end
   where id = p_source_id;

  return jsonb_build_object('ok', true);
end;
$$;

comment on function public.transition_source_compliance(text, public.source_compliance_state, public.source_compliance_state, text, text, boolean) is
  'Atomic compliance transition: locks the source row, compare-and-sets on the caller-validated from_state, and writes the audit event + state change in one transaction. Legality is owned by lib/ingestion/compliance.ts.';

-- Service role only. This function moves the approval ladder; nothing reachable
-- by an anon or authenticated session may call it.
revoke all on function public.transition_source_compliance(text, public.source_compliance_state, public.source_compliance_state, text, text, boolean) from public;
revoke all on function public.transition_source_compliance(text, public.source_compliance_state, public.source_compliance_state, text, text, boolean) from anon;
revoke all on function public.transition_source_compliance(text, public.source_compliance_state, public.source_compliance_state, text, text, boolean) from authenticated;
grant execute on function public.transition_source_compliance(text, public.source_compliance_state, public.source_compliance_state, text, text, boolean) to service_role;
