-- Per-destination authority for official_direct.
--
-- source_registry approves the official_direct *capability*. It must never
-- become blanket permission to fetch arbitrary hosts supplied by discovery
-- markup. This append-only ledger records a separate legal/robots decision for
-- each exact host/path scope. No rows are seeded, so applying this migration is
-- dark and default-deny.

create table public.official_destination_policy_event (
  id bigint generated always as identity primary key,
  idempotency_key uuid not null unique,
  hostname text not null,
  path_prefix text not null default '/',
  include_subdomains boolean not null default false,
  compliance_state public.source_compliance_state not null default 'draft',
  robots_posture text not null default 'unknown'
    check (robots_posture in (
      'permissive',
      'permissive_with_delay',
      'restricted',
      'unknown'
    )),
  tos_posture text not null default 'unreviewed'
    check (tos_posture in (
      'unreviewed',
      'permits_use',
      'prohibits_use',
      'requires_agreement'
    )),
  terms_url text,
  robots_url text,
  actor_user_id uuid not null references public.app_user(id) on delete restrict,
  reason text not null,
  decided_at timestamptz not null default now(),
  review_expires_at timestamptz,

  -- Store policy scopes in one canonical representation. Wildcards, schemes,
  -- ports, paths, query strings, and trailing dots never belong in hostname.
  constraint official_destination_hostname_canonical check (
    hostname = lower(btrim(hostname))
    and char_length(hostname) between 3 and 253
    and hostname ~ '^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])$'
    and hostname like '%.%'
    and position('..' in hostname) = 0
    and position(':' in hostname) = 0
    and position('/' in hostname) = 0
    and position('*' in hostname) = 0
    and hostname !~ '^[0-9]{1,3}([.][0-9]{1,3}){3}$'
  ),
  constraint official_destination_path_canonical check (
    path_prefix like '/%'
    and (path_prefix = '/' or right(path_prefix, 1) <> '/')
    and path_prefix !~ '[?#]'
    and path_prefix !~ '[[:space:]]'
    and char_length(path_prefix) <= 2048
  ),
  constraint official_destination_reason_required check (
    btrim(reason) <> ''
  ),
  constraint official_destination_terms_url_https check (
    terms_url is null or terms_url ~ '^https://[^[:space:]]+$'
  ),
  constraint official_destination_robots_url_https check (
    robots_url is null or robots_url ~ '^https://[^[:space:]]+$'
  ),
  constraint official_destination_review_window check (
    review_expires_at is null
    or (
      review_expires_at > decided_at
      and review_expires_at <= decided_at + interval '180 days'
    )
  ),
  -- Defense in depth: even a direct service-role insert cannot label a
  -- destination production-approved without the two reviewed permission
  -- postures required by the runtime gate.
  constraint official_destination_production_approval_complete check (
    compliance_state <> 'approved_for_production'
    or (
      tos_posture = 'permits_use'
      and robots_posture in ('permissive', 'permissive_with_delay')
      and terms_url is not null
      and robots_url is not null
      and review_expires_at is not null
    )
  )
);

comment on table public.official_destination_policy_event is
  'Append-only official_direct destination decisions. The latest exact host/path scope controls network access; absence is denial.';

create index official_destination_policy_scope_idx
  on public.official_destination_policy_event (
    hostname,
    path_prefix,
    include_subdomains,
    id desc
  );

-- The ledger itself is immutable. A pause, revocation, renewed review, or
-- corrected scope is a new attributed event, preserving the complete history.
create or replace function private.official_destination_policy_is_append_only()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception 'official_destination_policy_event is append-only (attempted %)', tg_op;
end;
$$;

revoke all on function private.official_destination_policy_is_append_only()
  from public, anon, authenticated;

create trigger official_destination_policy_no_update
  before update or delete on public.official_destination_policy_event
  for each row execute function private.official_destination_policy_is_append_only();

-- Serialize every append by idempotency key and exact scope. A replay of the
-- same mutation returns the original event, while a stale browser snapshot or
-- a reused key with different content fails without changing authority.
create function public.append_official_destination_policy_event(
  p_actor_user_id uuid,
  p_decision jsonb,
  p_expected_current_id bigint,
  p_idempotency_key uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing public.official_destination_policy_event%rowtype;
  v_current_id bigint;
  v_ledger_version bigint;
  v_expected_ledger_version bigint;
  v_inserted_id bigint;
  v_hostname text;
  v_path_prefix text;
  v_include_subdomains boolean;
  v_compliance_state public.source_compliance_state;
  v_robots_posture text;
  v_tos_posture text;
  v_terms_url text;
  v_robots_url text;
  v_reason text;
  v_review_expires_at timestamptz;
begin
  if p_actor_user_id is null or not exists (
    select 1
      from public.app_user actor
     where actor.id = p_actor_user_id
       and (actor.is_admin or actor.is_owner)
  ) then
    raise exception 'admin or owner actor required' using errcode = '42501';
  end if;

  if p_decision is null
     or jsonb_typeof(p_decision) <> 'object'
     or p_idempotency_key is null then
    raise exception 'decision and idempotency key are required'
      using errcode = '22023';
  end if;

  begin
    v_hostname := p_decision ->> 'hostname';
    v_path_prefix := p_decision ->> 'pathPrefix';
    v_include_subdomains :=
      (p_decision ->> 'includeSubdomains')::boolean;
    v_compliance_state :=
      (p_decision ->> 'complianceState')::public.source_compliance_state;
    v_robots_posture := p_decision ->> 'robotsPosture';
    v_tos_posture := p_decision ->> 'tosPosture';
    v_terms_url := nullif(p_decision ->> 'termsUrl', '');
    v_robots_url := nullif(p_decision ->> 'robotsUrl', '');
    v_reason := p_decision ->> 'reason';
    v_review_expires_at :=
      nullif(p_decision ->> 'reviewExpiresAt', '')::timestamptz;
    v_expected_ledger_version :=
      nullif(p_decision ->> 'expectedLedgerVersion', '')::bigint;
  exception
    when invalid_text_representation or datetime_field_overflow then
      raise exception 'invalid destination policy decision'
        using errcode = '22023';
  end;

  if v_compliance_state = 'approved_for_production'
     and coalesce(
       (p_decision ->> 'productionApprovalConfirmed')::boolean,
       false
     ) is not true then
    raise exception 'production approval confirmation required'
      using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'official_destination_policy:ledger',
      0
    )
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'official_destination_policy:idempotency:' || p_idempotency_key::text,
      0
    )
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'official_destination_policy:scope:'
      || coalesce(v_hostname, '')
      || E'\x1f'
      || coalesce(v_path_prefix, '')
      || E'\x1f'
      || coalesce(v_include_subdomains::text, ''),
      0
    )
  );

  select *
    into v_existing
    from public.official_destination_policy_event event
   where event.idempotency_key = p_idempotency_key;

  if found then
    if v_existing.actor_user_id = p_actor_user_id
       and v_existing.hostname = v_hostname
       and v_existing.path_prefix = v_path_prefix
       and v_existing.include_subdomains = v_include_subdomains
       and v_existing.compliance_state = v_compliance_state
       and v_existing.robots_posture = v_robots_posture
       and v_existing.tos_posture = v_tos_posture
       and v_existing.terms_url is not distinct from v_terms_url
       and v_existing.robots_url is not distinct from v_robots_url
       and v_existing.reason = v_reason
       and v_existing.review_expires_at
         is not distinct from v_review_expires_at then
      return jsonb_build_object(
        'id', v_existing.id,
        'idempotent', true
      );
    end if;

    raise exception 'idempotency key was already used for another decision'
      using errcode = '23505';
  end if;

  select max(event.id)
    into v_ledger_version
    from public.official_destination_policy_event event;

  if v_ledger_version is distinct from v_expected_ledger_version then
    raise exception 'official destination policy ledger changed; refresh and review again'
      using errcode = '40001';
  end if;

  select event.id
    into v_current_id
    from public.official_destination_policy_event event
   where event.hostname = v_hostname
     and event.path_prefix = v_path_prefix
     and event.include_subdomains = v_include_subdomains
   order by event.id desc
   limit 1;

  if v_current_id is distinct from p_expected_current_id then
    raise exception 'official destination policy changed; refresh and review again'
      using errcode = '40001';
  end if;

  insert into public.official_destination_policy_event (
    idempotency_key,
    hostname,
    path_prefix,
    include_subdomains,
    compliance_state,
    robots_posture,
    tos_posture,
    terms_url,
    robots_url,
    actor_user_id,
    reason,
    review_expires_at
  ) values (
    p_idempotency_key,
    v_hostname,
    v_path_prefix,
    v_include_subdomains,
    v_compliance_state,
    v_robots_posture,
    v_tos_posture,
    v_terms_url,
    v_robots_url,
    p_actor_user_id,
    v_reason,
    v_review_expires_at
  )
  returning id into v_inserted_id;

  return jsonb_build_object(
    'id', v_inserted_id,
    'idempotent', false
  );
end;
$$;

revoke all on function public.append_official_destination_policy_event(
  uuid,
  jsonb,
  bigint,
  uuid
) from public, anon, authenticated;
grant execute on function public.append_official_destination_policy_event(
  uuid,
  jsonb,
  bigint,
  uuid
) to service_role;

-- One current row per scope. security_invoker preserves the base table's RLS
-- instead of turning the view into a privilege bypass.
create view public.official_destination_policy_current
with (security_invoker = true)
as
select distinct on (hostname, path_prefix, include_subdomains)
  id,
  hostname,
  path_prefix,
  include_subdomains,
  compliance_state,
  robots_posture,
  tos_posture,
  terms_url,
  robots_url,
  case
    when compliance_state = 'approved_for_production' then actor_user_id
    else null
  end as approved_by,
  case
    when compliance_state = 'approved_for_production' then decided_at
    else null
  end as approved_at,
  review_expires_at
from public.official_destination_policy_event
order by hostname, path_prefix, include_subdomains, id desc;

comment on view public.official_destination_policy_current is
  'Latest append-only official destination decision for each exact host/path scope.';

alter table public.official_destination_policy_event enable row level security;

create policy official_destination_policy_operator_read
  on public.official_destination_policy_event
  for select
  to authenticated
  using (private.is_admin() or private.is_owner());

revoke all on table public.official_destination_policy_event
  from anon, authenticated, service_role;
grant select on table public.official_destination_policy_event to authenticated;
grant select on table public.official_destination_policy_event to service_role;

revoke all on table public.official_destination_policy_current
  from anon, authenticated, service_role;
grant select on table public.official_destination_policy_current
  to authenticated, service_role;
