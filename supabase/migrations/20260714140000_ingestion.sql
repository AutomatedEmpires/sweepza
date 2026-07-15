-- Ingestion provenance + run log. Backs the sweepstakes ingestion agent
-- (lib/ingestion/*, lib/db/ingestion.ts).
--
-- listing_ingestion is 1:1 with listing: provenance is *about* a listing, not
-- part of its identity, so it stays off the canonical listing object per
-- AGENTS.md. The official_url_key unique index is what makes re-ingestion
-- idempotent (upsert-refresh, never a duplicate).
create table listing_ingestion (
  listing_id uuid primary key references listing(id) on delete cascade,
  official_url_key text unique,          -- normalizeUrl(official/entry) — identity
  content_fingerprint text not null,     -- fallback identity when URL is absent
  discovery_source text,                 -- which Tier-1 source surfaced it
  official_source_url text,              -- the page actually fetched & extracted
  raw_snapshot_ref text,                 -- Storage key of the captured rules copy
  extraction_confidence numeric,         -- 0..1 from verify.ts
  content_hash text,                     -- cheap "unchanged since last run?" check
  first_ingested_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index listing_ingestion_fingerprint_idx on listing_ingestion (content_fingerprint);
create index listing_ingestion_last_seen_idx on listing_ingestion (last_seen_at);

-- Per-run observability: what a scheduled ingestion pass discovered and did.
create table ingestion_run (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  status text not null default 'running',   -- running | ok | error
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  discovered int not null default 0,
  fetched int not null default 0,
  created int not null default 0,
  updated int not null default 0,
  skipped int not null default 0,
  failed int not null default 0,
  notes text
);
create index ingestion_run_started_idx on ingestion_run (started_at desc);

-- Internal operational data: admin/owner read only. Writes run through the
-- service-role client (which bypasses RLS); no anon/public access.
alter table listing_ingestion enable row level security;
create policy listing_ingestion_admin_read on listing_ingestion for select
  using (private.is_admin() or private.is_owner());
grant select on listing_ingestion to authenticated;

alter table ingestion_run enable row level security;
create policy ingestion_run_admin_read on ingestion_run for select
  using (private.is_admin() or private.is_owner());
grant select on ingestion_run to authenticated;
