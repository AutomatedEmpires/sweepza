-- Listing lifecycle integrity — the persistent substrate for re-verification
-- scheduling, changed-page auditing, dead-link tracking, and explainable
-- deduplication (lib/ingestion/lifecycle.ts, lib/ingestion/fingerprint.ts).
--
-- All additive. No lifecycle transition runs on apply — these columns and
-- tables give the (still-gated) re-verification pass somewhere to record its
-- reasoning, and give the admin review queue the evidence to act on. Nothing
-- here publishes, hides, or mutates a live listing by itself.

-- Re-verification bookkeeping lives on listing_ingestion (1:1 with listing,
-- already the home of provenance) so it stays off the canonical listing object.
alter table listing_ingestion
  add column last_verified_at timestamptz,
  add column next_verify_due_at timestamptz,
  add column verify_priority int not null default 0,
  add column consecutive_fetch_failures int not null default 0,
  -- null = healthy; 'suspected' = failing, under retry; 'confirmed' = dead.
  add column dead_link_status text,
  add column last_fetch_failure_class text;

comment on column listing_ingestion.next_verify_due_at is
  'When lib/ingestion/lifecycle.planReverification says this listing is next due for a source re-check. Risk-based, not a global interval.';
comment on column listing_ingestion.dead_link_status is
  'null (healthy) | suspected (transient/unconfirmed) | confirmed (404/410 on repeat). Confirmed dead links are suppressed pending review, never deleted.';

create index listing_ingestion_verify_due_idx
  on listing_ingestion (next_verify_due_at) where next_verify_due_at is not null;

-- Append-only audit of every meaningful change detected at a source. A verified
-- listing is never silently overwritten (lib/ingestion/lifecycle.assessChange);
-- the intended change is recorded here for a reviewer, with the old and new
-- values preserved as evidence.
create table listing_change_event (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references listing(id) on delete cascade,
  field text not null,                      -- MaterialFacts key, or 'closed'/'disappeared'
  old_value text,
  new_value text,
  material boolean not null default false,
  disposition text not null,                -- ChangeDisposition
  overwrite_applied boolean not null default false,
  detected_at timestamptz not null default now()
);
create index listing_change_event_listing_idx
  on listing_change_event (listing_id, detected_at desc);

-- Explainable duplicate candidates. Distinct regional/recurring sweepstakes are
-- deliberately NOT collapsed; a suspected pair is recorded with the matched
-- signals so a reviewer can confirm or dismiss. duplicate_status on the listing
-- itself remains the authoritative resolution.
create table listing_duplicate_candidate (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references listing(id) on delete cascade,
  other_listing_id uuid references listing(id) on delete cascade,
  verdict text not null,                    -- identical | suspected | distinct
  strength numeric not null default 0,      -- 0..1 signal agreement
  signals jsonb,                            -- DuplicateSignal[]
  resolved boolean not null default false,
  created_at timestamptz not null default now(),
  -- One open candidate row per unordered pair; resolution flips `resolved`.
  unique (listing_id, other_listing_id)
);
create index listing_duplicate_candidate_open_idx
  on listing_duplicate_candidate (listing_id) where resolved = false;

-- Append-only guarantee for the change audit, matching source_approval_event.
create trigger listing_change_event_no_update
  before update or delete on listing_change_event
  for each row execute function private.source_approval_event_is_append_only();

-- Internal operational data: admin/owner read only; writes via service role.
alter table listing_change_event enable row level security;
create policy listing_change_event_admin_read on listing_change_event for select
  using (private.is_admin() or private.is_owner());
grant select on listing_change_event to authenticated;

alter table listing_duplicate_candidate enable row level security;
create policy listing_duplicate_candidate_admin_read on listing_duplicate_candidate for select
  using (private.is_admin() or private.is_owner());
grant select on listing_duplicate_candidate to authenticated;
