-- Core tables: app_user, host, listing, listing_tag, listing_seeker_state.
-- Canonical Data Model sections 2-6. One canonical listing row; seeker state
-- lives in a separate join, never on listing.

create table app_user (
  id uuid primary key default gen_random_uuid(),
  clerk_user_id text unique not null,
  email text,
  display_name text,
  cover_image_url text,
  bio text,
  is_owner boolean not null default false,
  is_admin boolean not null default false,
  is_host boolean not null default false,
  is_seeker boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint app_user_bio_len check (bio is null or char_length(bio) <= 300)
);

create table host (
  id uuid primary key default gen_random_uuid(),
  app_user_id uuid not null references app_user(id) on delete cascade,
  display_name text not null,
  logo_url text,
  website_url text,
  short_description text,
  verification_status host_verification_status not null default 'none',
  stripe_customer_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint host_desc_len check (short_description is null or char_length(short_description) <= 300)
);
create index host_app_user_idx on host (app_user_id);

create table listing (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  short_description text not null,
  long_description text,
  prize_name text not null,
  prize_value numeric,
  prize_currency text default 'USD',
  prize_category text references category(code),
  winner_count int,
  main_image_url text,
  image_source_type image_source_type,
  image_alt_text text,
  category_fallback_image text,
  entry_url text,
  official_rules_url text,
  official_rules_exception boolean not null default false,
  start_date date,
  end_date date,
  entry_frequency entry_frequency,
  entry_limit_notes text,
  eligibility_country text,
  eligibility_states text[],
  age_requirement int,
  no_purchase_necessary boolean,
  source_type source_type not null,
  public_source_label source_label not null,
  created_by_role created_by_role not null,
  created_by_user_id uuid references app_user(id),
  host_id uuid references host(id),
  sponsor_name text,
  sponsor_url text,
  sponsor_logo_url text,
  sponsor_notes_internal text,
  lifecycle_status lifecycle_status not null default 'draft',
  visibility_status visibility_status not null default 'private',
  moderation_status moderation_status not null default 'clear',
  duplicate_status duplicate_status not null default 'clear',
  listing_verification_status listing_verification_status not null default 'unreviewed',
  is_featured boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  constraint listing_title_len check (char_length(title) <= 70),
  constraint listing_short_desc_len check (char_length(short_description) <= 140),
  constraint listing_long_desc_len check (long_description is null or char_length(long_description) <= 2000)
);
create index listing_discover_idx on listing (visibility_status, lifecycle_status, published_at desc);
create index listing_host_idx on listing (host_id);
create index listing_category_idx on listing (prize_category);
create index listing_end_date_idx on listing (end_date);

create table listing_tag (
  listing_id uuid not null references listing(id) on delete cascade,
  tag_code text not null references tag(code),
  primary key (listing_id, tag_code)
);

create table listing_seeker_state (
  id uuid primary key default gen_random_uuid(),
  app_user_id uuid not null references app_user(id) on delete cascade,
  listing_id uuid not null references listing(id) on delete cascade,
  viewed_at timestamptz,
  saved_at timestamptz,
  entered_at timestamptz,
  skipped_at timestamptz,
  won_at timestamptz,
  primary_ui_state seeker_ui_state not null default 'none',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (app_user_id, listing_id)
);
create index seeker_state_user_idx on listing_seeker_state (app_user_id);
create index seeker_state_listing_idx on listing_seeker_state (listing_id);
