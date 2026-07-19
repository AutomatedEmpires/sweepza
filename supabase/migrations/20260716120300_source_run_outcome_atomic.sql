-- Circuit-breaker accounting must be a single database mutation. The previous
-- read/increment/write sequence lost failures when concurrent runs observed the
-- same counter. This function locks and updates the source row atomically.

create or replace function public.record_source_run_outcome(
  p_source_id text,
  p_ok boolean,
  p_failure_class text,
  p_failure_threshold integer
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
begin
  update public.source_registry
     set last_run_at = v_now,
         last_success_at = case when p_ok then v_now else last_success_at end,
         last_failure_at = case when p_ok then last_failure_at else v_now end,
         last_failure_class = case when p_ok then null else p_failure_class end,
         consecutive_failures = case when p_ok then 0 else consecutive_failures + 1 end,
         circuit_opened_at = case
           when p_ok then null
           when consecutive_failures + 1 >= greatest(p_failure_threshold, 1)
             then coalesce(circuit_opened_at, v_now)
           else null
         end
   where id = p_source_id;

  return found;
end;
$$;

comment on function public.record_source_run_outcome(text, boolean, text, integer) is
  'Atomically records source success/failure and advances or resets its circuit breaker.';

revoke all on function public.record_source_run_outcome(text, boolean, text, integer) from public;
revoke all on function public.record_source_run_outcome(text, boolean, text, integer) from anon;
revoke all on function public.record_source_run_outcome(text, boolean, text, integer) from authenticated;
grant execute on function public.record_source_run_outcome(text, boolean, text, integer) to service_role;
