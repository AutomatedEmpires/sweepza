-- Engagement: winner_post, winner_reaction, report, listing_claim.
-- Canonical Data Model sections 7-9.

create table winner_post (
  id uuid primary key default gen_random_uuid(),
  app_user_id uuid not null references app_user(id) on delete cascade,
  listing_id uuid references listing(id) on delete set null,
  caption text,
  photo_url text,
  review_status winner_review_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint winner_caption_len check (caption is null or char_length(caption) <= 500)
);
create index winner_post_published_idx on winner_post (review_status, created_at desc);

create table winner_reaction (
  id uuid primary key default gen_random_uuid(),
  winner_post_id uuid not null references winner_post(id) on delete cascade,
  app_user_id uuid not null references app_user(id) on delete cascade,
  reaction_type reaction_type not null,
  created_at timestamptz not null default now(),
  unique (winner_post_id, app_user_id, reaction_type)
);

create table report (
  id uuid primary key default gen_random_uuid(),
  reporter_user_id uuid not null references app_user(id) on delete cascade,
  target_type report_target_type not null,
  target_id uuid not null,
  reason_code report_reason not null,
  details text,
  status report_status not null default 'submitted',
  ai_severity report_ai_severity,
  assigned_admin_id uuid references app_user(id),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index report_status_idx on report (status, created_at desc);

create table listing_claim (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references listing(id) on delete cascade,
  requesting_host_id uuid not null references host(id) on delete cascade,
  status claim_status not null default 'requested',
  reviewed_by uuid references app_user(id),
  requested_at timestamptz not null default now(),
  reviewed_at timestamptz
);
create index listing_claim_listing_idx on listing_claim (listing_id);
