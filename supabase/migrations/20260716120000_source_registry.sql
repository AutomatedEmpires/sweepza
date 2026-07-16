-- Source compliance registry — the DATA half of "an unapproved source cannot
-- run". lib/ingestion/source.ts encodes the reviewed policy floor in code; this
-- table records the founder's actual approval decision, who made it, and when.
-- Production execution requires BOTH to say approved_for_production (see
-- lib/ingestion/gate.ts), so neither a code edit nor a database edit can
-- unilaterally turn a source live.
--
-- Additive and dark: every row seeds at 'draft'. Applying this migration
-- activates nothing.

create type source_compliance_state as enum (
  'draft',
  'research_required',
  'reviewed',
  'approved_for_fixtures',
  'approved_for_manual_check',
  'approved_for_production',
  'paused',
  'blocked',
  'revoked'
);

create table source_registry (
  id text primary key,                                  -- matches SourceDescriptor.id
  compliance_state source_compliance_state not null default 'draft',
  -- Independent of compliance_state so a source can be stopped instantly
  -- without unwinding (or later having to rebuild) its approval history.
  kill_switch boolean not null default false,
  approved_by text,                                     -- actor of the last approval transition
  approved_at timestamptz,
  -- Circuit breaker: consecutive failed runs, and when the breaker tripped.
  consecutive_failures int not null default 0,
  circuit_opened_at timestamptz,
  last_run_at timestamptz,
  last_success_at timestamptz,
  last_failure_at timestamptz,
  last_failure_class text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Append-only decision log. Every state change lands here with an actor and a
-- reason; this is the audit trail a compliance question gets answered from, so
-- nothing may rewrite it (no update/delete policy exists, and the trigger below
-- refuses even a service-role attempt).
create table source_approval_event (
  id uuid primary key default gen_random_uuid(),
  source_id text not null references source_registry(id) on delete cascade,
  from_state source_compliance_state,
  to_state source_compliance_state not null,
  actor text not null,
  reason text,
  created_at timestamptz not null default now()
);
create index source_approval_event_source_idx on source_approval_event (source_id, created_at desc);

-- search_path pinned to match the repo's hardened-function convention
-- (20260607000000_harden_function_search_path.sql).
create or replace function private.source_approval_event_is_append_only()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  raise exception 'source_approval_event is append-only (attempted %)', tg_op;
end;
$$;

create trigger source_approval_event_no_update
  before update or delete on source_approval_event
  for each row execute function private.source_approval_event_is_append_only();

-- Conditional-request state per fetched URL: what the source last told us about
-- this page, so the next pass can ask "changed?" instead of re-downloading and
-- re-extracting. Cheaper for us and materially politer to the source.
create table source_fetch_state (
  source_id text not null references source_registry(id) on delete cascade,
  url_key text not null,                                -- normalizeUrl(url)
  etag text,
  last_modified text,
  content_hash text,
  last_status int,
  last_failure_class text,
  consecutive_failures int not null default 0,
  last_fetched_at timestamptz not null default now(),
  last_changed_at timestamptz,
  primary key (source_id, url_key)
);
create index source_fetch_state_fetched_idx on source_fetch_state (last_fetched_at);

create trigger source_registry_set_updated_at
  before update on source_registry
  for each row execute function public.set_updated_at();

-- Seed every configured source at the floor. 'draft' cannot execute anything —
-- production approval is a deliberate founder transition recorded through
-- lib/db/source-registry.ts, never an implicit consequence of deploying code.
insert into source_registry (id, notes) values
  ('official_direct',   'Sponsor official pages. Tier A source of truth; reach is bounded per-lead rather than by a host allowlist.'),
  ('sweeps_advantage',  'Sweepstakes Advantage. Robots permissive; ToS review outstanding.'),
  ('freebie_guy',       'The Freebie Guy. Robots permissive with Crawl-delay: 10; ToS review outstanding.'),
  ('sweepstakes_today', 'Sweepstakes Today. Robots fully permissive; no conditional-request support; ToS review outstanding.');

-- Internal operational data: admin/owner read only. Writes run through the
-- service-role client (which bypasses RLS); no anon/public access.
alter table source_registry enable row level security;
create policy source_registry_admin_read on source_registry for select
  using (private.is_admin() or private.is_owner());
grant select on source_registry to authenticated;

alter table source_approval_event enable row level security;
create policy source_approval_event_admin_read on source_approval_event for select
  using (private.is_admin() or private.is_owner());
grant select on source_approval_event to authenticated;

alter table source_fetch_state enable row level security;
create policy source_fetch_state_admin_read on source_fetch_state for select
  using (private.is_admin() or private.is_owner());
grant select on source_fetch_state to authenticated;
