-- Durable, provider-idempotent reminder email delivery.
--
-- notification_log remains the owner-readable per-reminder event history. The
-- exact provider request lives in a private outbox only while it can be safely
-- retried. Service-role-only RPCs reserve event keys and delivery state in one
-- transaction, then use short compare-and-set leases around the external call.

create table private.notification_delivery (
  id uuid primary key default gen_random_uuid(),
  app_user_id uuid not null references public.app_user(id) on delete cascade,
  notification_type text not null,
  channel public.notification_channel not null default 'email',
  status public.notification_status not null default 'queued',
  idempotency_key text not null unique,
  recipient text,
  sender text,
  reply_to text,
  subject text,
  html text,
  metadata jsonb not null default '{}'::jsonb,
  attempt_count integer not null default 0,
  first_attempt_at timestamptz,
  next_attempt_at timestamptz,
  send_before timestamptz,
  lease_token uuid,
  lease_expires_at timestamptz,
  provider_message_id text,
  last_error_code text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notification_delivery_idempotency_key_length
    check (char_length(idempotency_key) between 1 and 256),
  constraint notification_delivery_attempt_count_nonnegative
    check (attempt_count >= 0),
  constraint notification_delivery_first_attempt_consistent
    check (
      (attempt_count = 0 and first_attempt_at is null)
      or (attempt_count > 0 and first_attempt_at is not null)
    ),
  constraint notification_delivery_metadata_object
    check (jsonb_typeof(metadata) = 'object'),
  constraint notification_delivery_supported_status
    check (status in ('queued', 'sent', 'failed', 'skipped', 'suppressed')),
  constraint notification_delivery_queued_payload
    check (
      status <> 'queued'
      or (
        nullif(btrim(recipient), '') is not null
        and nullif(btrim(sender), '') is not null
        and nullif(btrim(reply_to), '') is not null
        and nullif(subject, '') is not null
        and nullif(html, '') is not null
        and next_attempt_at is not null
        and send_before is not null
      )
    ),
  constraint notification_delivery_lease_pair
    check ((lease_token is null) = (lease_expires_at is null))
);

comment on table private.notification_delivery is
  'Private exact-request outbox for bounded, provider-idempotent email retries. Terminal transitions purge recipient, subject, and HTML payload fields.';

create index notification_delivery_app_user_idx
  on private.notification_delivery (app_user_id, created_at desc);

create index notification_delivery_due_idx
  on private.notification_delivery (next_attempt_at, lease_expires_at, created_at)
  where status = 'queued';

alter table private.notification_delivery enable row level security;
revoke all on table private.notification_delivery from public;
revoke all on table private.notification_delivery from anon;
revoke all on table private.notification_delivery from authenticated;
revoke all on table private.notification_delivery from service_role;

-- One shared rolling window coordinates every serverless outbox caller. Eight
-- requests in any trailing second stays below Resend's default team-wide 10
-- requests/second ceiling and leaves headroom for other transactional mail.
create table private.email_transport_rate_window (
  singleton boolean primary key default true,
  request_times timestamptz[] not null default array[]::timestamptz[],
  constraint email_transport_rate_window_singleton check (singleton),
  constraint email_transport_rate_window_count check (
    cardinality(request_times) <= 8
    and array_position(request_times, null) is null
  )
);

insert into private.email_transport_rate_window (
  singleton,
  request_times
) values (true, array[]::timestamptz[]);

alter table private.email_transport_rate_window enable row level security;
revoke all on table private.email_transport_rate_window from public;
revoke all on table private.email_transport_rate_window from anon;
revoke all on table private.email_transport_rate_window from authenticated;
revoke all on table private.email_transport_rate_window from service_role;

alter table public.notification_log
  add column if not exists delivery_id uuid,
  add column if not exists dedupe_key text,
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'notification_log_delivery_id_fkey'
       and conrelid = 'public.notification_log'::regclass
  ) then
    alter table public.notification_log
      add constraint notification_log_delivery_id_fkey
      foreign key (delivery_id)
      references private.notification_delivery(id)
      on delete set null;
  end if;
end
$$;

-- Preserve historical duplicate rows. Give exactly one canonical row for each
-- valid legacy reminder event its durable key, preferring a confirmed send.
with legacy as (
  select
    nl.id,
    concat(
      nl.type,
      '|',
      nl.metadata ->> 'listingId',
      '|',
      nl.metadata ->> 'reminderKey'
    ) as canonical_key,
    row_number() over (
      partition by
        nl.app_user_id,
        nl.channel,
        nl.type,
        nl.metadata ->> 'listingId',
        nl.metadata ->> 'reminderKey'
      order by
        (nl.status = 'sent') desc,
        nl.sent_at asc nulls last,
        nl.created_at asc,
        nl.id asc
    ) as canonical_rank
  from public.notification_log nl
  where nl.channel = 'email'
    and nl.type in ('ready_again', 'ends_today', 'ending_soon')
    and jsonb_typeof(nl.metadata -> 'listingId') = 'string'
    and jsonb_typeof(nl.metadata -> 'reminderKey') = 'string'
    and nullif(nl.metadata ->> 'listingId', '') is not null
    and nullif(nl.metadata ->> 'reminderKey', '') is not null
)
update public.notification_log nl
   set dedupe_key = legacy.canonical_key,
       updated_at = now()
  from legacy
 where nl.id = legacy.id
   and legacy.canonical_rank = 1
   and nl.dedupe_key is null;

create unique index notification_log_event_dedupe_idx
  on public.notification_log (app_user_id, channel, type, dedupe_key)
  where dedupe_key is not null;

create index notification_log_delivery_id_idx
  on public.notification_log (delivery_id)
  where delivery_id is not null;

-- Preserve the one-digest-per-UTC-day cadence for any legacy reminder sends.
insert into public.notification_log (
  app_user_id,
  type,
  channel,
  status,
  sent_at,
  metadata,
  dedupe_key,
  created_at,
  updated_at
)
select
  legacy.app_user_id,
  'seeker_reminder_digest',
  'email',
  case
    when bool_or(legacy.status in ('sent', 'delivered', 'read')) then 'sent'
    else 'suppressed'
  end::public.notification_status,
  max(legacy.sent_at),
  jsonb_build_object('legacyBackfill', true),
  'seeker_reminder_digest|'
    || to_char(
      min(coalesce(legacy.sent_at, legacy.created_at)) at time zone 'UTC',
      'YYYY-MM-DD'
    ),
  min(legacy.created_at),
  now()
from public.notification_log legacy
where legacy.channel = 'email'
  and legacy.type in ('ready_again', 'ends_today', 'ending_soon')
group by
  legacy.app_user_id,
  (coalesce(legacy.sent_at, legacy.created_at) at time zone 'UTC')::date
on conflict (app_user_id, channel, type, dedupe_key)
  where dedupe_key is not null
  do nothing;

-- Reserve one exact digest request and all of its reminder event keys. Locking
-- app_user serializes competing claims for the same recipient without holding
-- any lock across the provider request.
create or replace function public.claim_reminder_email_delivery(
  p_app_user_id uuid,
  p_recipient text,
  p_sender text,
  p_reply_to text,
  p_subject text,
  p_html text,
  p_send_before timestamptz,
  p_events jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_delivery_id uuid := gen_random_uuid();
  v_lease_token uuid := gen_random_uuid();
  v_idempotency_key text;
  v_current_recipient text;
  v_email_enabled boolean := true;
  v_ready_again boolean := true;
  v_ends_today boolean := true;
  v_ends_soon boolean := true;
  v_digest_dedupe_key text;
  v_digest_log_id uuid;
begin
  if nullif(btrim(p_recipient), '') is null
     or nullif(btrim(p_sender), '') is null
     or nullif(btrim(p_reply_to), '') is null
     or nullif(p_subject, '') is null
     or nullif(p_html, '') is null then
    return jsonb_build_object('claimed', false, 'reason', 'invalid_payload');
  end if;

  if p_send_before is null
     or p_send_before <= v_now + interval '30 seconds'
     or p_send_before > v_now + interval '23 hours' then
    return jsonb_build_object('claimed', false, 'reason', 'invalid_send_window');
  end if;

  if p_events is null or jsonb_typeof(p_events) <> 'array' then
    return jsonb_build_object('claimed', false, 'reason', 'invalid_events');
  end if;

  if jsonb_array_length(p_events) < 1
     or jsonb_array_length(p_events) > 12 then
    return jsonb_build_object('claimed', false, 'reason', 'invalid_events');
  end if;

  if exists (
    select 1
      from jsonb_array_elements(p_events) as event(value)
     where jsonb_typeof(event.value) <> 'object'
        or nullif(event.value ->> 'type', '') is null
        or event.value ->> 'type' not in ('ready_again', 'ends_today', 'ending_soon')
        or nullif(event.value ->> 'dedupe_key', '') is null
        or char_length(event.value ->> 'dedupe_key') > 512
        or coalesce(jsonb_typeof(event.value -> 'metadata'), '') <> 'object'
  ) then
    return jsonb_build_object('claimed', false, 'reason', 'invalid_events');
  end if;

  if (
    select count(*)
      from jsonb_array_elements(p_events)
  ) <> (
    select count(distinct (event.value ->> 'type', event.value ->> 'dedupe_key'))
      from jsonb_array_elements(p_events) as event(value)
  ) then
    return jsonb_build_object('claimed', false, 'reason', 'duplicate_events');
  end if;

  select au.email
    into v_current_recipient
    from public.app_user au
   where au.id = p_app_user_id
     for update;
  if not found then
    return jsonb_build_object('claimed', false, 'reason', 'unknown_user');
  end if;
  if v_current_recipient is null
     or lower(btrim(v_current_recipient)) <> lower(btrim(p_recipient)) then
    return jsonb_build_object('claimed', false, 'reason', 'recipient_changed');
  end if;

  select
    np.email_enabled,
    np.ready_again,
    np.ends_today,
    np.ends_soon
  into
    v_email_enabled,
    v_ready_again,
    v_ends_today,
    v_ends_soon
  from public.notification_pref np
  where np.app_user_id = p_app_user_id
  for share;

  if not found then
    v_email_enabled := true;
    v_ready_again := true;
    v_ends_today := true;
    v_ends_soon := true;
  elsif (
    not v_email_enabled
    or (not v_ready_again and exists (
      select 1 from jsonb_array_elements(p_events) event(value)
      where event.value ->> 'type' = 'ready_again'
    ))
    or (not v_ends_today and exists (
      select 1 from jsonb_array_elements(p_events) event(value)
      where event.value ->> 'type' = 'ends_today'
    ))
    or (not v_ends_soon and exists (
      select 1 from jsonb_array_elements(p_events) event(value)
      where event.value ->> 'type' = 'ending_soon'
    ))
  ) then
    return jsonb_build_object('claimed', false, 'reason', 'preference_disabled');
  end if;

  -- Lock every referenced listing snapshot in deterministic order before the
  -- final clock sample. A concurrent correction completes first or waits until
  -- after this reservation; it cannot make the validation clock stale.
  perform l.id
  from jsonb_array_elements(p_events) event(value)
  join public.listing l
    on l.id::text = event.value -> 'metadata' ->> 'listingId'
  join public.listing_seeker_state lss
    on lss.listing_id = l.id
   and lss.app_user_id = p_app_user_id
  order by l.id
  for share of lss, l;

  -- Lock waits can cross the UTC-day or final-send boundary. Recompute the
  -- authoritative clock before validating or reserving durable state.
  v_now := clock_timestamp();
  if p_send_before <= v_now + interval '30 seconds'
     or p_send_before > v_now + interval '23 hours' then
    return jsonb_build_object('claimed', false, 'reason', 'invalid_send_window');
  end if;

  if not private.email_delivery_reminders_current(
    p_app_user_id,
    jsonb_build_object('events', p_events),
    v_now,
    v_ready_again,
    v_ends_today,
    v_ends_soon
  ) then
    return jsonb_build_object(
      'claimed', false,
      'reason', 'reminder_no_longer_current'
    );
  end if;

  v_digest_dedupe_key := 'seeker_reminder_digest|'
    || to_char(v_now at time zone 'UTC', 'YYYY-MM-DD');

  -- The user row lock serializes competing claims. Check the daily reservation
  -- only after every potentially blocking validation so a concurrent disjoint
  -- event set is a safe no-op rather than a unique-index exception.
  if exists (
    select 1
    from public.notification_log nl
    where nl.app_user_id = p_app_user_id
      and nl.channel = 'email'
      and nl.type = 'seeker_reminder_digest'
      and nl.dedupe_key = v_digest_dedupe_key
  ) then
    return jsonb_build_object('claimed', false, 'reason', 'already_claimed');
  end if;

  if exists (
    select 1
      from jsonb_array_elements(p_events) as event(value)
      join public.notification_log nl
        on nl.app_user_id = p_app_user_id
       and nl.channel = 'email'
       and nl.type = event.value ->> 'type'
       and nl.dedupe_key = event.value ->> 'dedupe_key'
  ) then
    return jsonb_build_object('claimed', false, 'reason', 'already_claimed');
  end if;

  v_idempotency_key := 'sweepza/reminder/' || v_delivery_id::text;

  insert into private.notification_delivery (
    id,
    app_user_id,
    notification_type,
    channel,
    status,
    idempotency_key,
    recipient,
    sender,
    reply_to,
    subject,
    html,
    metadata,
    attempt_count,
    first_attempt_at,
    next_attempt_at,
    send_before,
    lease_token,
    lease_expires_at,
    created_at,
    updated_at
  ) values (
    v_delivery_id,
    p_app_user_id,
    'seeker_reminder_digest',
    'email',
    'queued',
    v_idempotency_key,
    p_recipient,
    p_sender,
    p_reply_to,
    p_subject,
    p_html,
    jsonb_build_object('events', p_events),
    0,
    null,
    v_now,
    p_send_before,
    v_lease_token,
    v_now + interval '5 minutes',
    v_now,
    v_now
  );

  -- Reserve the daily cadence atomically. The user lock is the normal fast
  -- path; ON CONFLICT is the final race-safe boundary for overlapping
  -- statements whose snapshots began before the lock holder committed.
  insert into public.notification_log (
    app_user_id,
    type,
    channel,
    status,
    sent_at,
    metadata,
    delivery_id,
    dedupe_key,
    created_at,
    updated_at
  ) values (
    p_app_user_id,
    'seeker_reminder_digest',
    'email',
    'queued',
    null,
    jsonb_build_object(
      'deliveryId', v_delivery_id,
      'eventCount', jsonb_array_length(p_events)
    ),
    v_delivery_id,
    v_digest_dedupe_key,
    v_now,
    v_now
  )
  on conflict (app_user_id, channel, type, dedupe_key)
    where dedupe_key is not null
    do nothing
  returning id into v_digest_log_id;

  if v_digest_log_id is null then
    delete from private.notification_delivery nd
    where nd.id = v_delivery_id;
    return jsonb_build_object('claimed', false, 'reason', 'already_claimed');
  end if;

  insert into public.notification_log (
    app_user_id,
    type,
    channel,
    status,
    sent_at,
    metadata,
    delivery_id,
    dedupe_key,
    created_at,
    updated_at
  )
  select
    p_app_user_id,
    event.value ->> 'type',
    'email',
    'queued',
    null,
    (event.value -> 'metadata') || jsonb_build_object('deliveryId', v_delivery_id),
    v_delivery_id,
    event.value ->> 'dedupe_key',
    v_now,
    v_now
  from jsonb_array_elements(p_events) as event(value);

  return jsonb_build_object(
    'claimed', true,
    'delivery', jsonb_build_object(
      'delivery_id', v_delivery_id,
      'app_user_id', p_app_user_id,
      'notification_type', 'seeker_reminder_digest',
      'idempotency_key', v_idempotency_key,
      'recipient', p_recipient,
      'sender', p_sender,
      'reply_to', p_reply_to,
      'subject', p_subject,
      'html', p_html,
      'metadata', jsonb_build_object('events', p_events),
      'lease_token', v_lease_token,
      'attempt_count', 0,
      'send_before', p_send_before
    )
  );
end;
$$;

comment on function public.claim_reminder_email_delivery(uuid, text, text, text, text, text, timestamptz, jsonb) is
  'Atomically reserves one exact reminder digest and all per-reminder event keys. Service role only.';

-- Purge expired exact payloads independently from provider activation. This is
-- safe to run while outbound transport is disabled and returns visible counts
-- for operational alerting.
create or replace function public.purge_expired_email_deliveries(
  p_limit integer default 50
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_payload_expired integer := 0;
  v_provider_window_expired integer := 0;
  v_log_rows integer := 0;
begin
  with expired_candidates as (
    select nd.id
      from private.notification_delivery nd
     where nd.status = 'queued'
       and (nd.lease_expires_at is null or nd.lease_expires_at <= v_now)
       and (
         nd.send_before <= v_now
         or nd.first_attempt_at <= v_now - interval '23 hours'
       )
     order by
       least(nd.send_before, nd.first_attempt_at + interval '23 hours') asc,
       nd.created_at asc
     limit least(greatest(coalesce(p_limit, 50), 1), 100)
       for update skip locked
  ), expired as (
    update private.notification_delivery nd
       set status = 'suppressed',
           last_error_code = case
             when nd.send_before <= v_now then 'reminder_payload_expired'
             else 'provider_idempotency_window_expired'
           end,
           recipient = null,
           sender = null,
           reply_to = null,
           subject = null,
           html = null,
           next_attempt_at = null,
           lease_token = null,
           lease_expires_at = null,
           updated_at = v_now
      from expired_candidates candidate
     where nd.id = candidate.id
    returning nd.id, nd.last_error_code
  ), updated_logs as (
    update public.notification_log nl
       set status = 'suppressed',
           metadata = nl.metadata || jsonb_build_object(
             'delivery_reason', expired.last_error_code
           ),
           updated_at = v_now
      from expired
     where nl.delivery_id = expired.id
       and nl.status = 'queued'
    returning nl.id
  )
  select
    count(*) filter (
      where expired.last_error_code = 'reminder_payload_expired'
    )::integer,
    count(*) filter (
      where expired.last_error_code = 'provider_idempotency_window_expired'
    )::integer,
    (select count(*)::integer from updated_logs)
  into v_payload_expired, v_provider_window_expired, v_log_rows
  from expired;

  return jsonb_build_object(
    'suppressed', v_payload_expired + v_provider_window_expired,
    'payload_expired', v_payload_expired,
    'provider_window_expired', v_provider_window_expired,
    'notification_logs_updated', v_log_rows
  );
end;
$$;

comment on function public.purge_expired_email_deliveries(integer) is
  'Bounded SKIP LOCKED purge of expired queued email payloads with visible reason counts. Service role only.';

-- Claim retryable deliveries without blocking other workers.
create or replace function public.claim_due_email_deliveries(
  p_limit integer default 5
) returns table (
  delivery_id uuid,
  app_user_id uuid,
  notification_type text,
  idempotency_key text,
  recipient text,
  sender text,
  reply_to text,
  subject text,
  html text,
  metadata jsonb,
  lease_token uuid,
  attempt_count integer,
  send_before timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
begin
  return query
  with candidates as (
    select nd.id
      from private.notification_delivery nd
     where nd.status = 'queued'
       and nd.next_attempt_at <= v_now
       and (nd.lease_expires_at is null or nd.lease_expires_at <= v_now)
       and nd.send_before > v_now
       and (
         nd.first_attempt_at is null
         or nd.first_attempt_at > v_now - interval '23 hours'
       )
     order by nd.next_attempt_at asc, nd.created_at asc
     limit least(greatest(coalesce(p_limit, 5), 1), 5)
       for update skip locked
  ), claimed as (
    update private.notification_delivery nd
       set lease_token = gen_random_uuid(),
           lease_expires_at = v_now + interval '5 minutes',
           updated_at = v_now
      from candidates c
     where nd.id = c.id
    returning nd.*
  )
  select
    claimed.id,
    claimed.app_user_id,
    claimed.notification_type,
    claimed.idempotency_key,
    claimed.recipient,
    claimed.sender,
    claimed.reply_to,
    claimed.subject,
    claimed.html,
    claimed.metadata,
    claimed.lease_token,
    claimed.attempt_count,
    claimed.send_before
  from claimed;
end;
$$;

comment on function public.claim_due_email_deliveries(integer) is
  'Claims due outbox rows with SKIP LOCKED and suppresses stale ambiguous requests before Resend idempotency expires. Service role only.';

-- Re-check every frozen reminder against live seeker and listing state while
-- taking row locks. The caller invokes this once to acquire the locks and once
-- after any provider-bucket wait with a freshly sampled database clock.
create or replace function private.email_delivery_reminders_current(
  p_app_user_id uuid,
  p_metadata jsonb,
  p_now timestamptz,
  p_ready_again boolean,
  p_ends_today boolean,
  p_ends_soon boolean
) returns boolean
language sql
security definer
set search_path = ''
as $$
  select not exists (
    select 1
    from jsonb_array_elements(p_metadata -> 'events') event(value)
    where not exists (
      select 1
      from public.listing_seeker_state lss
      join public.listing l on l.id = lss.listing_id
      cross join lateral (
        select case l.entry_frequency
          when 'daily' then (
            date_trunc('day', lss.entered_at at time zone 'UTC')
            + interval '1 day'
          ) at time zone 'UTC'
          when 'instant_win' then (
            date_trunc('day', lss.entered_at at time zone 'UTC')
            + interval '1 day'
          ) at time zone 'UTC'
          when 'weekly' then lss.entered_at + interval '7 days'
          when 'monthly' then lss.entered_at + interval '30 days'
          else null
        end as reopen_at
      ) reopen
      where lss.app_user_id = p_app_user_id
        and l.id::text = event.value -> 'metadata' ->> 'listingId'
        and l.lifecycle_status = 'active'
        and l.visibility_status = 'public'
        and l.end_date is not null
        and l.end_date >= (p_now at time zone 'UTC')::date
        and (lss.saved_at is not null or lss.entered_at is not null)
        and lss.skipped_at is null
        and lss.won_at is null
        and l.slug = event.value -> 'metadata' ->> 'slug'
        and l.title = event.value -> 'metadata' ->> 'title'
        and l.end_date::text = event.value -> 'metadata' ->> 'endDate'
        and coalesce(l.entry_frequency::text, 'other')
          = event.value -> 'metadata' ->> 'entryFrequency'
        and event.value ->> 'dedupe_key' = concat(
          event.value ->> 'type',
          '|',
          l.id::text,
          '|',
          event.value -> 'metadata' ->> 'reminderKey'
        )
        and (
          (
            event.value ->> 'type' = 'ends_today'
            and p_ends_today
            and l.end_date = (p_now at time zone 'UTC')::date
            and event.value -> 'metadata' ->> 'reminderKey' = l.end_date::text
          )
          or (
            event.value ->> 'type' = 'ending_soon'
            and p_ends_soon
            and l.end_date > (p_now at time zone 'UTC')::date
            and l.end_date <= (p_now at time zone 'UTC')::date + 3
            and event.value -> 'metadata' ->> 'reminderKey' = l.end_date::text
          )
          or (
            event.value ->> 'type' = 'ready_again'
            and p_ready_again
            and lss.entered_at is not null
            and reopen.reopen_at is not null
            and reopen.reopen_at <= p_now
            and not (
              p_ends_today
              and l.end_date = (p_now at time zone 'UTC')::date
            )
            and not (
              p_ends_soon
              and l.end_date > (p_now at time zone 'UTC')::date
              and l.end_date <= (p_now at time zone 'UTC')::date + 3
            )
            and event.value -> 'metadata' ->> 'reminderKey'
              = to_char(reopen.reopen_at at time zone 'UTC', 'YYYY-MM-DD')
          )
        )
      for share of lss, l
    )
  );
$$;

comment on function private.email_delivery_reminders_current(
  uuid,
  jsonb,
  timestamptz,
  boolean,
  boolean,
  boolean
) is 'Locks and validates frozen reminder events against current seeker and listing state.';

-- Re-authorize the exact request immediately before transport using database
-- time. The short buffer avoids starting a request as its content, provider
-- idempotency, or worker-lease window closes. Expired content is atomically
-- suppressed; a stale lease fails closed without changing delivery state.
create or replace function public.authorize_email_delivery_transport(
  p_delivery_id uuid,
  p_lease_token uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_safety_deadline timestamptz := v_now + interval '30 seconds';
  v_app_user_id uuid;
  v_notification_type text;
  v_recipient text;
  v_metadata jsonb;
  v_first_attempt_at timestamptz;
  v_send_before timestamptz;
  v_lease_expires_at timestamptz;
  v_current_recipient text;
  v_email_enabled boolean := true;
  v_ready_again boolean := true;
  v_ends_today boolean := true;
  v_ends_soon boolean := true;
  v_reason text;
  v_rate_request_times timestamptz[];
  v_rate_next_attempt_at timestamptz;
begin
  -- Follow the same parent-before-child lock order as account deletion and the
  -- producer claim. The first lookup is deliberately unlocked; every field is
  -- re-read only after the app_user row prevents a concurrent cascade.
  select nd.app_user_id
    into v_app_user_id
    from private.notification_delivery nd
   where nd.id = p_delivery_id
     and nd.status = 'queued'
     and nd.lease_token = p_lease_token;

  if not found then
    return jsonb_build_object(
      'authorized', false,
      'suppressed', false,
      'reason', 'cas_miss'
    );
  end if;

  select au.email
    into v_current_recipient
    from public.app_user au
   where au.id = v_app_user_id
     for update;

  if not found then
    return jsonb_build_object(
      'authorized', false,
      'suppressed', false,
      'reason', 'cas_miss'
    );
  end if;

  select
    nd.notification_type,
    nd.recipient,
    nd.metadata,
    nd.first_attempt_at,
    nd.send_before,
    nd.lease_expires_at
  into
    v_notification_type,
    v_recipient,
    v_metadata,
    v_first_attempt_at,
    v_send_before,
    v_lease_expires_at
  from private.notification_delivery nd
  where nd.id = p_delivery_id
    and nd.app_user_id = v_app_user_id
    and nd.status = 'queued'
    and nd.lease_token = p_lease_token
  for update;

  if not found then
    return jsonb_build_object(
      'authorized', false,
      'suppressed', false,
      'reason', 'cas_miss'
    );
  end if;

  if v_send_before <= v_safety_deadline then
    v_reason := 'reminder_payload_expired';
  elsif v_first_attempt_at + interval '23 hours' <= v_safety_deadline then
    v_reason := 'provider_idempotency_window_expired';
  elsif v_lease_expires_at <= v_safety_deadline then
    return jsonb_build_object(
      'authorized', false,
      'suppressed', false,
      'reason', 'lease_window_closing'
    );
  elsif v_notification_type <> 'seeker_reminder_digest' then
    v_reason := 'unsupported_delivery_type';
  elsif jsonb_typeof(v_metadata) <> 'object'
     or (
       case
         when jsonb_typeof(v_metadata -> 'events') = 'array' then (
           jsonb_array_length(v_metadata -> 'events') < 1
           or jsonb_array_length(v_metadata -> 'events') > 12
         )
         else true
       end
     )
     or exists (
       select 1
       from jsonb_array_elements(
         case
           when jsonb_typeof(v_metadata -> 'events') = 'array'
             then v_metadata -> 'events'
           else '[]'::jsonb
         end
       ) event(value)
       where jsonb_typeof(event.value) <> 'object'
          or nullif(event.value ->> 'type', '') is null
          or event.value ->> 'type' not in ('ready_again', 'ends_today', 'ending_soon')
          or nullif(event.value ->> 'dedupe_key', '') is null
          or jsonb_typeof(event.value -> 'metadata') <> 'object'
          or nullif(event.value -> 'metadata' ->> 'listingId', '') is null
          or nullif(event.value -> 'metadata' ->> 'slug', '') is null
          or nullif(event.value -> 'metadata' ->> 'title', '') is null
          or nullif(event.value -> 'metadata' ->> 'endDate', '') is null
          or nullif(event.value -> 'metadata' ->> 'entryFrequency', '') is null
          or nullif(event.value -> 'metadata' ->> 'reminderKey', '') is null
     ) then
    v_reason := 'invalid_delivery_metadata';
  else
    if nullif(btrim(v_current_recipient), '') is null then
      v_reason := 'recipient_unavailable';
    elsif lower(btrim(v_current_recipient)) <> lower(btrim(v_recipient)) then
      v_reason := 'recipient_changed';
    else
      select
        np.email_enabled,
        np.ready_again,
        np.ends_today,
        np.ends_soon
      into
        v_email_enabled,
        v_ready_again,
        v_ends_today,
        v_ends_soon
      from public.notification_pref np
      where np.app_user_id = v_app_user_id
      for share;

      if not found then
        v_email_enabled := true;
        v_ready_again := true;
        v_ends_today := true;
        v_ends_soon := true;
      end if;

      if not v_email_enabled
         or exists (
           select 1
           from jsonb_array_elements(v_metadata -> 'events') event(value)
           where (event.value ->> 'type' = 'ready_again' and not v_ready_again)
              or (event.value ->> 'type' = 'ends_today' and not v_ends_today)
              or (event.value ->> 'type' = 'ending_soon' and not v_ends_soon)
         ) then
        v_reason := 'notification_preference_changed';
      elsif not private.email_delivery_reminders_current(
        v_app_user_id,
        v_metadata,
        v_now,
        v_ready_again,
        v_ends_today,
        v_ends_soon
      ) then
        v_reason := 'reminder_no_longer_current';
      end if;
    end if;
  end if;

  if v_reason is null then
    insert into private.email_transport_rate_window (
      singleton,
      request_times
    ) values (
      true,
      array[]::timestamptz[]
    )
    on conflict (singleton) do nothing;

    select rate_window.request_times
    into v_rate_request_times
    from private.email_transport_rate_window rate_window
    where rate_window.singleton
    for update;

    -- The delivery, recipient, preference, listing, and provider-window locks
    -- may all block. Only this final clock sample can authorize transport.
    v_now := clock_timestamp();
    v_safety_deadline := v_now + interval '30 seconds';

    if v_send_before <= v_safety_deadline then
      v_reason := 'reminder_payload_expired';
    elsif v_first_attempt_at is not null
       and v_first_attempt_at + interval '23 hours' <= v_safety_deadline then
      v_reason := 'provider_idempotency_window_expired';
    elsif v_lease_expires_at <= v_safety_deadline then
      return jsonb_build_object(
        'authorized', false,
        'suppressed', false,
        'reason', 'lease_window_closing'
      );
    elsif not private.email_delivery_reminders_current(
      v_app_user_id,
      v_metadata,
      v_now,
      v_ready_again,
      v_ends_today,
      v_ends_soon
    ) then
      v_reason := 'reminder_no_longer_current';
    end if;

    if v_reason is null then
      select coalesce(
        array_agg(recent.request_time order by recent.request_time),
        array[]::timestamptz[]
      )
      into v_rate_request_times
      from unnest(v_rate_request_times) recent(request_time)
      where recent.request_time > v_now - interval '1 second';

      if cardinality(v_rate_request_times) >= 8 then
        v_rate_next_attempt_at := v_rate_request_times[1]
          + interval '1 second 50 milliseconds';
        update private.email_transport_rate_window
           set request_times = v_rate_request_times
         where singleton;

        update private.notification_delivery nd
           set next_attempt_at = v_rate_next_attempt_at,
               lease_token = null,
               lease_expires_at = null,
               updated_at = v_now
         where nd.id = p_delivery_id
           and nd.status = 'queued'
           and nd.lease_token = p_lease_token;

        if not found then
          return jsonb_build_object(
            'authorized', false,
            'suppressed', false,
            'reason', 'cas_miss'
          );
        end if;

        return jsonb_build_object(
          'authorized', false,
          'suppressed', false,
          'deferred', true,
          'reason', 'provider_rate_window_full'
        );
      end if;

      update private.notification_delivery nd
         set attempt_count = nd.attempt_count + 1,
             first_attempt_at = coalesce(nd.first_attempt_at, v_now),
             updated_at = v_now
       where nd.id = p_delivery_id
         and nd.status = 'queued'
         and nd.lease_token = p_lease_token;

      if not found then
        return jsonb_build_object(
          'authorized', false,
          'suppressed', false,
          'reason', 'cas_miss'
        );
      end if;

      update private.email_transport_rate_window
         set request_times = array_append(v_rate_request_times, v_now)
       where singleton;

      return jsonb_build_object(
        'authorized', true,
        'suppressed', false
      );
    end if;
  end if;

  update private.notification_delivery nd
     set status = 'suppressed',
         last_error_code = v_reason,
         recipient = null,
         sender = null,
         reply_to = null,
         subject = null,
         html = null,
         next_attempt_at = null,
         lease_token = null,
         lease_expires_at = null,
         updated_at = v_now
   where nd.id = p_delivery_id
     and nd.status = 'queued'
     and nd.lease_token = p_lease_token;

  if not found then
    return jsonb_build_object(
      'authorized', false,
      'suppressed', false,
      'reason', 'cas_miss'
    );
  end if;

  update public.notification_log nl
     set status = 'suppressed',
         dedupe_key = case
           when v_reason = 'reminder_no_longer_current' then null
           else nl.dedupe_key
         end,
         metadata = nl.metadata
           || jsonb_build_object('delivery_reason', v_reason)
           || case
             when v_reason = 'reminder_no_longer_current' then
               jsonb_build_object('released_dedupe_key', nl.dedupe_key)
             else '{}'::jsonb
           end,
         updated_at = v_now
   where nl.delivery_id = p_delivery_id
     and nl.status = 'queued';

  return jsonb_build_object(
    'authorized', false,
    'suppressed', true,
    'reason', v_reason
  );
end;
$$;

comment on function public.authorize_email_delivery_transport(uuid, uuid) is
  'Token-CAS transport authorization using final database time, terminal suppression before expiry, and a shared rolling provider-rate window. Service role only.';

create or replace function public.complete_email_delivery(
  p_delivery_id uuid,
  p_lease_token uuid,
  p_provider_message_id text
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_completed_id uuid;
begin
  if nullif(btrim(p_provider_message_id), '') is null
     or char_length(p_provider_message_id) > 512 then
    return false;
  end if;

  update private.notification_delivery nd
     set status = 'sent',
         provider_message_id = p_provider_message_id,
         sent_at = v_now,
         recipient = null,
         sender = null,
         reply_to = null,
         subject = null,
         html = null,
         next_attempt_at = null,
         lease_token = null,
         lease_expires_at = null,
         last_error_code = null,
         updated_at = v_now
   where nd.id = p_delivery_id
     and nd.status = 'queued'
     and nd.lease_token = p_lease_token
  returning nd.id into v_completed_id;

  if v_completed_id is null then
    return false;
  end if;

  update public.notification_log nl
     set status = 'sent',
         sent_at = v_now,
         updated_at = v_now
   where nl.delivery_id = v_completed_id
     and nl.status = 'queued';

  return true;
end;
$$;

comment on function public.complete_email_delivery(uuid, uuid, text) is
  'Token-CAS completion of a provider-confirmed email and all of its reminder event rows. Service role only.';

create or replace function public.fail_email_delivery(
  p_delivery_id uuid,
  p_lease_token uuid,
  p_error_code text,
  p_retryable boolean
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_first_attempt_at timestamptz;
  v_send_before timestamptz;
  v_attempt_count integer;
  v_next_attempt_at timestamptz;
  v_retry_scheduled boolean;
  v_error_code text := left(coalesce(nullif(btrim(p_error_code), ''), 'unknown'), 120);
begin
  select nd.first_attempt_at, nd.send_before, nd.attempt_count
    into v_first_attempt_at, v_send_before, v_attempt_count
    from private.notification_delivery nd
   where nd.id = p_delivery_id
     and nd.status = 'queued'
     and nd.lease_token = p_lease_token
     for update;

  if not found then
    return jsonb_build_object('recorded', false, 'reason', 'cas_miss');
  end if;

  v_retry_scheduled := coalesce(p_retryable, false)
    and v_send_before > v_now
    and v_first_attempt_at > v_now - interval '23 hours';

  if v_retry_scheduled then
    v_next_attempt_at := v_now + make_interval(
      secs => least(
        3600,
        (60 * power(2, least(greatest(v_attempt_count - 1, 0), 5)))::integer
      )
    );

    if v_next_attempt_at >= v_send_before
       or v_next_attempt_at >= v_first_attempt_at + interval '23 hours' then
      v_retry_scheduled := false;
      v_next_attempt_at := null;
    end if;
  end if;

  if v_retry_scheduled then
    update private.notification_delivery nd
       set next_attempt_at = v_next_attempt_at,
           lease_token = null,
           lease_expires_at = null,
           last_error_code = v_error_code,
           updated_at = v_now
     where nd.id = p_delivery_id;

    update public.notification_log nl
       set updated_at = v_now
     where nl.delivery_id = p_delivery_id
       and nl.status = 'queued';

    return jsonb_build_object(
      'recorded', true,
      'retry_scheduled', true,
      'next_attempt_at', v_next_attempt_at
    );
  end if;

  update private.notification_delivery nd
     set status = 'failed',
         last_error_code = v_error_code,
         recipient = null,
         sender = null,
         reply_to = null,
         subject = null,
         html = null,
         next_attempt_at = null,
         lease_token = null,
         lease_expires_at = null,
         updated_at = v_now
   where nd.id = p_delivery_id;

  update public.notification_log nl
     set status = 'failed',
         metadata = nl.metadata || jsonb_build_object(
           'delivery_reason', v_error_code
         ),
         updated_at = v_now
   where nl.delivery_id = p_delivery_id
     and nl.status = 'queued';

  return jsonb_build_object(
    'recorded', true,
    'retry_scheduled', false
  );
end;
$$;

comment on function public.fail_email_delivery(uuid, uuid, text, boolean) is
  'Token-CAS provider failure recording with bounded exponential retry inside the content and provider-idempotency windows. Service role only.';

create or replace function public.suppress_email_delivery(
  p_delivery_id uuid,
  p_lease_token uuid,
  p_reason text
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_suppressed_id uuid;
  v_reason text := left(coalesce(nullif(btrim(p_reason), ''), 'suppressed'), 120);
begin
  update private.notification_delivery nd
     set status = 'skipped',
         last_error_code = v_reason,
         recipient = null,
         sender = null,
         reply_to = null,
         subject = null,
         html = null,
         next_attempt_at = null,
         lease_token = null,
         lease_expires_at = null,
         updated_at = v_now
   where nd.id = p_delivery_id
     and nd.status = 'queued'
     and nd.lease_token = p_lease_token
  returning nd.id into v_suppressed_id;

  if v_suppressed_id is null then
    return false;
  end if;

  update public.notification_log nl
     set status = 'skipped',
         metadata = nl.metadata || jsonb_build_object(
           'delivery_reason', v_reason
         ),
         updated_at = v_now
   where nl.delivery_id = v_suppressed_id
     and nl.status = 'queued';

  return true;
end;
$$;

comment on function public.suppress_email_delivery(uuid, uuid, text) is
  'Token-CAS opt-out or recipient-change suppression without contacting the email provider. Service role only.';

revoke all on function private.email_delivery_reminders_current(uuid, jsonb, timestamptz, boolean, boolean, boolean) from public;
revoke all on function private.email_delivery_reminders_current(uuid, jsonb, timestamptz, boolean, boolean, boolean) from anon;
revoke all on function private.email_delivery_reminders_current(uuid, jsonb, timestamptz, boolean, boolean, boolean) from authenticated;
revoke all on function private.email_delivery_reminders_current(uuid, jsonb, timestamptz, boolean, boolean, boolean) from service_role;

revoke all on function public.claim_reminder_email_delivery(uuid, text, text, text, text, text, timestamptz, jsonb) from public;
revoke all on function public.claim_reminder_email_delivery(uuid, text, text, text, text, text, timestamptz, jsonb) from anon;
revoke all on function public.claim_reminder_email_delivery(uuid, text, text, text, text, text, timestamptz, jsonb) from authenticated;
grant execute on function public.claim_reminder_email_delivery(uuid, text, text, text, text, text, timestamptz, jsonb) to service_role;

revoke all on function public.claim_due_email_deliveries(integer) from public;
revoke all on function public.claim_due_email_deliveries(integer) from anon;
revoke all on function public.claim_due_email_deliveries(integer) from authenticated;
grant execute on function public.claim_due_email_deliveries(integer) to service_role;

revoke all on function public.purge_expired_email_deliveries(integer) from public;
revoke all on function public.purge_expired_email_deliveries(integer) from anon;
revoke all on function public.purge_expired_email_deliveries(integer) from authenticated;
grant execute on function public.purge_expired_email_deliveries(integer) to service_role;

revoke all on function public.authorize_email_delivery_transport(uuid, uuid) from public;
revoke all on function public.authorize_email_delivery_transport(uuid, uuid) from anon;
revoke all on function public.authorize_email_delivery_transport(uuid, uuid) from authenticated;
grant execute on function public.authorize_email_delivery_transport(uuid, uuid) to service_role;

revoke all on function public.complete_email_delivery(uuid, uuid, text) from public;
revoke all on function public.complete_email_delivery(uuid, uuid, text) from anon;
revoke all on function public.complete_email_delivery(uuid, uuid, text) from authenticated;
grant execute on function public.complete_email_delivery(uuid, uuid, text) to service_role;

revoke all on function public.fail_email_delivery(uuid, uuid, text, boolean) from public;
revoke all on function public.fail_email_delivery(uuid, uuid, text, boolean) from anon;
revoke all on function public.fail_email_delivery(uuid, uuid, text, boolean) from authenticated;
grant execute on function public.fail_email_delivery(uuid, uuid, text, boolean) to service_role;

revoke all on function public.suppress_email_delivery(uuid, uuid, text) from public;
revoke all on function public.suppress_email_delivery(uuid, uuid, text) from anon;
revoke all on function public.suppress_email_delivery(uuid, uuid, text) from authenticated;
grant execute on function public.suppress_email_delivery(uuid, uuid, text) to service_role;
