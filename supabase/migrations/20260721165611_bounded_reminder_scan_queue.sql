-- Indexed, acknowledged producer queue for seeker reminder scans. Provider
-- delivery remains in the durable outbox; this queue only schedules bounded
-- seeker/candidate pages and retries abandoned scans after a short lease.

create table private.seeker_reminder_scan_state (
  app_user_id uuid primary key references public.app_user(id) on delete cascade,
  next_scan_at timestamptz not null default now(),
  lease_token uuid,
  lease_expires_at timestamptz,
  cursor_end_date date,
  cursor_listing_id uuid,
  updated_at timestamptz not null default now(),
  constraint seeker_reminder_scan_lease_pair
    check ((lease_token is null) = (lease_expires_at is null)),
  constraint seeker_reminder_scan_cursor_pair
    check ((cursor_end_date is null) = (cursor_listing_id is null))
);

comment on table private.seeker_reminder_scan_state is
  'Service-only indexed schedule, lease, and lossless candidate-page cursor for seeker reminder production.';

create index seeker_reminder_scan_due_idx
  on private.seeker_reminder_scan_state (
    next_scan_at,
    lease_expires_at,
    app_user_id
  );

alter table private.seeker_reminder_scan_state enable row level security;
revoke all on table private.seeker_reminder_scan_state from public;
revoke all on table private.seeker_reminder_scan_state from anon;
revoke all on table private.seeker_reminder_scan_state from authenticated;
revoke all on table private.seeker_reminder_scan_state from service_role;

-- Recompute one user's queue membership from current source-of-truth rows. A
-- mutation invalidates an active lease so an older worker cannot overwrite the
-- wake-up or restore a stale cursor. Ineligible users are removed rather than
-- left perpetually due in the indexed queue.
create or replace function private.refresh_seeker_reminder_scan(
  p_app_user_id uuid,
  p_now timestamptz default clock_timestamp()
) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_app_user_id is null then
    return;
  end if;

  if not exists (
    select 1
    from public.app_user au
    left join public.notification_pref np on np.app_user_id = au.id
    where au.id = p_app_user_id
      and nullif(btrim(au.email), '') is not null
      and coalesce(np.email_enabled, true)
      and (
        coalesce(np.ready_again, true)
        or coalesce(np.ends_today, true)
        or coalesce(np.ends_soon, true)
      )
      and exists (
        select 1
        from public.listing_seeker_state lss
        join public.listing l on l.id = lss.listing_id
        where lss.app_user_id = au.id
          and l.lifecycle_status = 'active'
          and l.visibility_status = 'public'
          and l.end_date is not null
          and l.end_date >= (p_now at time zone 'UTC')::date
          and (lss.saved_at is not null or lss.entered_at is not null)
          and lss.skipped_at is null
          and lss.won_at is null
      )
  ) then
    delete from private.seeker_reminder_scan_state scan
    where scan.app_user_id = p_app_user_id;
    return;
  end if;

  insert into private.seeker_reminder_scan_state as scan (
    app_user_id,
    next_scan_at,
    updated_at
  ) values (
    p_app_user_id,
    p_now,
    p_now
  )
  on conflict on constraint seeker_reminder_scan_state_pkey do update
    set next_scan_at = least(scan.next_scan_at, excluded.next_scan_at),
        lease_token = null,
        lease_expires_at = null,
        cursor_end_date = null,
        cursor_listing_id = null,
        updated_at = excluded.updated_at;
end;
$$;

-- Releasing an unattempted stale snapshot's dedupe keys must wake the producer
-- in the same transaction. Invalidating an active scan lease prevents a worker
-- that observed the old reservation from restoring a one-day defer afterward.
create or replace function private.requeue_seeker_reminder_scan_on_key_release()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.dedupe_key is not null
     and new.dedupe_key is null
     and new.metadata ->> 'delivery_reason' = 'reminder_no_longer_current' then
    perform private.refresh_seeker_reminder_scan(new.app_user_id);
  end if;
  return new;
end;
$$;

create trigger trg_requeue_seeker_reminder_scan_on_key_release
after update of dedupe_key on public.notification_log
for each row execute function private.requeue_seeker_reminder_scan_on_key_release();

create or replace function private.queue_seeker_reminder_scan_from_state()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    perform private.refresh_seeker_reminder_scan(old.app_user_id);
    return old;
  end if;

  if tg_op = 'UPDATE' and old.app_user_id is distinct from new.app_user_id then
    perform private.refresh_seeker_reminder_scan(old.app_user_id);
  end if;
  perform private.refresh_seeker_reminder_scan(new.app_user_id);
  return new;
end;
$$;

create trigger trg_queue_seeker_reminder_scan_from_state
after insert or delete or update of app_user_id, listing_id, saved_at, entered_at, skipped_at, won_at
on public.listing_seeker_state
for each row execute function private.queue_seeker_reminder_scan_from_state();

create or replace function private.queue_seeker_reminder_scans_from_listing()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_app_user_id uuid;
begin
  for v_app_user_id in
    select distinct lss.app_user_id
    from public.listing_seeker_state lss
    where lss.listing_id = new.id
    order by lss.app_user_id
  loop
    perform private.refresh_seeker_reminder_scan(v_app_user_id);
  end loop;
  return new;
end;
$$;

create trigger trg_queue_seeker_reminder_scans_from_listing
after update of lifecycle_status, visibility_status, end_date, slug, title, entry_frequency
on public.listing
for each row execute function private.queue_seeker_reminder_scans_from_listing();

create or replace function private.queue_seeker_reminder_scan_from_pref()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    perform private.refresh_seeker_reminder_scan(old.app_user_id);
    return old;
  end if;
  if tg_op = 'UPDATE' and old.app_user_id is distinct from new.app_user_id then
    perform private.refresh_seeker_reminder_scan(old.app_user_id);
  end if;
  perform private.refresh_seeker_reminder_scan(new.app_user_id);
  return new;
end;
$$;

create trigger trg_queue_seeker_reminder_scan_from_pref
after insert or update or delete
on public.notification_pref
for each row execute function private.queue_seeker_reminder_scan_from_pref();

create or replace function private.queue_seeker_reminder_scan_from_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.refresh_seeker_reminder_scan(new.id);
  return new;
end;
$$;

create trigger trg_queue_seeker_reminder_scan_from_email
after update of email on public.app_user
for each row execute function private.queue_seeker_reminder_scan_from_email();

revoke all on function private.refresh_seeker_reminder_scan(uuid, timestamptz) from public;
revoke all on function private.requeue_seeker_reminder_scan_on_key_release() from public;
revoke all on function private.queue_seeker_reminder_scan_from_state() from public;
revoke all on function private.queue_seeker_reminder_scans_from_listing() from public;
revoke all on function private.queue_seeker_reminder_scan_from_pref() from public;
revoke all on function private.queue_seeker_reminder_scan_from_email() from public;

-- Install the state trigger before the one-time backfill. CREATE TRIGGER holds
-- its table lock until migration commit, closing the write gap between the
-- snapshot and future trigger-maintained rows.
insert into private.seeker_reminder_scan_state (app_user_id, next_scan_at)
select distinct lss.app_user_id, clock_timestamp()
from public.listing_seeker_state lss
join public.listing l on l.id = lss.listing_id
join public.app_user au on au.id = lss.app_user_id
left join public.notification_pref np on np.app_user_id = lss.app_user_id
where nullif(btrim(au.email), '') is not null
  and coalesce(np.email_enabled, true)
  and (
    coalesce(np.ready_again, true)
    or coalesce(np.ends_today, true)
    or coalesce(np.ends_soon, true)
  )
  and l.lifecycle_status = 'active'
  and l.visibility_status = 'public'
  and l.end_date is not null
  and l.end_date >= (clock_timestamp() at time zone 'UTC')::date
  and (lss.saved_at is not null or lss.entered_at is not null)
  and lss.skipped_at is null
  and lss.won_at is null
on conflict on constraint seeker_reminder_scan_state_pkey do nothing;

-- Claim only indexed due queue rows. SKIP LOCKED distributes overlapping cron
-- workers instead of blocking or returning an under-filled conflicting batch.
-- Each seeker receives at most 12 candidates; the cursor makes overflow pages
-- lossless without permitting more than one digest per UTC day.
create or replace function public.claim_seeker_reminder_scan_batch(
  p_limit integer default 20
) returns table (
  app_user_id uuid,
  scan_token uuid,
  email text,
  display_name text,
  ready_again boolean,
  ends_today boolean,
  ends_soon boolean,
  email_enabled boolean,
  has_more_candidates boolean,
  next_cursor_end_date date,
  next_cursor_listing_id uuid,
  candidates jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
begin
  return query
  with due as (
    select scan.app_user_id
    from private.seeker_reminder_scan_state scan
    where scan.next_scan_at <= v_now
      and (scan.lease_expires_at is null or scan.lease_expires_at <= v_now)
    order by scan.next_scan_at asc, scan.app_user_id asc
    limit least(greatest(coalesce(p_limit, 20), 1), 50)
    for update of scan skip locked
  ), eligible as (
    select due.app_user_id
    from due
    join public.app_user au on au.id = due.app_user_id
    left join public.notification_pref np on np.app_user_id = due.app_user_id
    where nullif(btrim(au.email), '') is not null
      and coalesce(np.email_enabled, true)
      and (
        coalesce(np.ready_again, true)
        or coalesce(np.ends_today, true)
        or coalesce(np.ends_soon, true)
      )
      and exists (
        select 1
        from public.listing_seeker_state lss
        join public.listing l on l.id = lss.listing_id
        where lss.app_user_id = due.app_user_id
          and l.lifecycle_status = 'active'
          and l.visibility_status = 'public'
          and l.end_date is not null
          and l.end_date >= (v_now at time zone 'UTC')::date
          and (lss.saved_at is not null or lss.entered_at is not null)
          and lss.skipped_at is null
          and lss.won_at is null
      )
  ), deferred as (
    update private.seeker_reminder_scan_state scan
       set next_scan_at = v_now + interval '1 day',
           lease_token = null,
           lease_expires_at = null,
           cursor_end_date = null,
           cursor_listing_id = null,
           updated_at = v_now
      from due
     where scan.app_user_id = due.app_user_id
       and not exists (
         select 1
         from eligible
         where eligible.app_user_id = due.app_user_id
       )
    returning scan.app_user_id
  ), claimed as (
    update private.seeker_reminder_scan_state scan
       set lease_token = gen_random_uuid(),
           lease_expires_at = v_now + interval '2 minutes',
           updated_at = v_now
      from eligible
     where scan.app_user_id = eligible.app_user_id
    returning scan.*
  )
  select
    claimed.app_user_id,
    claimed.lease_token,
    au.email,
    au.display_name,
    coalesce(np.ready_again, true),
    coalesce(np.ends_today, true),
    coalesce(np.ends_soon, true),
    coalesce(np.email_enabled, true),
    candidate_page.row_count > 12,
    case when candidate_page.row_count > 12 then candidate_page.cursor_end_date end,
    case when candidate_page.row_count > 12 then candidate_page.cursor_listing_id end,
    candidate_page.value
  from claimed
  join public.app_user au on au.id = claimed.app_user_id
  left join public.notification_pref np on np.app_user_id = claimed.app_user_id
  cross join lateral (
    select
      count(*) as row_count,
      coalesce(
        jsonb_agg(page.value order by page.end_date, page.listing_id)
          filter (where page.position <= 12),
        '[]'::jsonb
      ) as value,
      max(page.end_date) filter (where page.position = 12) as cursor_end_date,
      (
        max(page.listing_id::text) filter (where page.position = 12)
      )::uuid as cursor_listing_id
    from (
      select
        l.end_date,
        l.id as listing_id,
        row_number() over (order by l.end_date asc, l.id asc) as position,
        jsonb_build_object(
          'saved_at', lss.saved_at,
          'entered_at', lss.entered_at,
          'skipped_at', lss.skipped_at,
          'won_at', lss.won_at,
          'listing', jsonb_build_object(
            'id', l.id,
            'slug', l.slug,
            'title', l.title,
            'end_date', l.end_date,
            'entry_frequency', coalesce(l.entry_frequency::text, 'other')
          )
        ) as value
      from public.listing_seeker_state lss
      join public.listing l on l.id = lss.listing_id
      where lss.app_user_id = claimed.app_user_id
        and l.lifecycle_status = 'active'
        and l.visibility_status = 'public'
        and l.end_date is not null
        and l.end_date >= (v_now at time zone 'UTC')::date
        and (lss.saved_at is not null or lss.entered_at is not null)
        and lss.skipped_at is null
        and lss.won_at is null
        and (
          claimed.cursor_end_date is null
          or (l.end_date, l.id) > (
            claimed.cursor_end_date,
            claimed.cursor_listing_id
          )
        )
      order by l.end_date asc, l.id asc
      limit 13
    ) page
  ) candidate_page;
end;
$$;

comment on function public.claim_seeker_reminder_scan_batch(integer) is
  'Claims indexed due seeker scans with SKIP LOCKED and returns one lossless 12-candidate page per seeker. Service role only.';

create or replace function public.complete_seeker_reminder_scan(
  p_app_user_id uuid,
  p_scan_token uuid,
  p_success boolean,
  p_defer_for_day boolean,
  p_has_more_candidates boolean,
  p_next_cursor_end_date date,
  p_next_cursor_listing_id uuid
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
begin
  if coalesce(p_success, false)
     and coalesce(p_has_more_candidates, false)
     and (p_next_cursor_end_date is null or p_next_cursor_listing_id is null) then
    return false;
  end if;

  update private.seeker_reminder_scan_state scan
     set next_scan_at = case
           when not coalesce(p_success, false) then v_now + interval '1 minute'
           when coalesce(p_has_more_candidates, false) then v_now + interval '1 minute'
           when coalesce(p_defer_for_day, false) then v_now + interval '1 day'
           else v_now + interval '1 day'
         end,
         cursor_end_date = case
           when not coalesce(p_success, false) then scan.cursor_end_date
           when coalesce(p_has_more_candidates, false) then p_next_cursor_end_date
           else null
         end,
         cursor_listing_id = case
           when not coalesce(p_success, false) then scan.cursor_listing_id
           when coalesce(p_has_more_candidates, false) then p_next_cursor_listing_id
           else null
         end,
         lease_token = null,
         lease_expires_at = null,
         updated_at = v_now
   where scan.app_user_id = p_app_user_id
     and scan.lease_token = p_scan_token;

  return found;
end;
$$;

comment on function public.complete_seeker_reminder_scan(uuid, uuid, boolean, boolean, boolean, date, uuid) is
  'Acknowledges a scan lease, requeues failures, advances overflow pages, and defers completed digests for one day. Service role only.';

-- Exact bounded history lookup keeps durable keys in an RPC POST body and
-- intentionally considers only the email channel.
create or replace function public.find_claimed_reminder_email_keys(
  p_app_user_id uuid,
  p_dedupe_keys text[]
) returns table (dedupe_key text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_app_user_id is null
     or p_dedupe_keys is null
     or cardinality(p_dedupe_keys) < 1
     or cardinality(p_dedupe_keys) > 12
     or exists (
       select 1
       from unnest(p_dedupe_keys) as item(value)
       where nullif(item.value, '') is null
          or char_length(item.value) > 512
     ) then
    raise exception using
      errcode = '22023',
      message = 'invalid reminder dedupe key lookup';
  end if;

  return query
  select nl.dedupe_key
  from public.notification_log nl
  where nl.app_user_id = p_app_user_id
    and nl.channel = 'email'
    and nl.type in ('ready_again', 'ends_today', 'ending_soon')
    and nl.dedupe_key = any (p_dedupe_keys);
end;
$$;

comment on function public.find_claimed_reminder_email_keys(uuid, text[]) is
  'Returns already-reserved email reminder keys from one 12-candidate scan page. Service role only.';

revoke all on function public.claim_seeker_reminder_scan_batch(integer) from public;
revoke all on function public.claim_seeker_reminder_scan_batch(integer) from anon;
revoke all on function public.claim_seeker_reminder_scan_batch(integer) from authenticated;
grant execute on function public.claim_seeker_reminder_scan_batch(integer) to service_role;

revoke all on function public.complete_seeker_reminder_scan(uuid, uuid, boolean, boolean, boolean, date, uuid) from public;
revoke all on function public.complete_seeker_reminder_scan(uuid, uuid, boolean, boolean, boolean, date, uuid) from anon;
revoke all on function public.complete_seeker_reminder_scan(uuid, uuid, boolean, boolean, boolean, date, uuid) from authenticated;
grant execute on function public.complete_seeker_reminder_scan(uuid, uuid, boolean, boolean, boolean, date, uuid) to service_role;

revoke all on function public.find_claimed_reminder_email_keys(uuid, text[]) from public;
revoke all on function public.find_claimed_reminder_email_keys(uuid, text[]) from anon;
revoke all on function public.find_claimed_reminder_email_keys(uuid, text[]) from authenticated;
grant execute on function public.find_claimed_reminder_email_keys(uuid, text[]) to service_role;
