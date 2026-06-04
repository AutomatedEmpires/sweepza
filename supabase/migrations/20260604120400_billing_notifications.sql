-- Billing & notifications: subscription, boost, notification_pref, notification_log.
-- Canonical Data Model sections 10-11. Hard active-listing cap = 10.

create table subscription (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references host(id) on delete cascade,
  stripe_subscription_id text,
  status subscription_status not null default 'no_plan',
  included_active_listings int not null default 1,
  purchased_additional_listings int not null default 0,
  max_active_listings int not null default 10,
  founding_host_number int,
  founding_discount_percent int,
  founding_discount_retained boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subscription_cap check (max_active_listings <= 10),
  constraint subscription_cap_nonneg check (max_active_listings >= 0)
);
create index subscription_host_idx on subscription (host_id);

create table boost (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references listing(id) on delete cascade,
  host_id uuid not null references host(id) on delete cascade,
  type boost_type not null,
  status boost_status not null default 'scheduled',
  starts_at timestamptz,
  ends_at timestamptz,
  stripe_payment_id text,
  created_at timestamptz not null default now()
);
create index boost_listing_idx on boost (listing_id, status);

create table notification_pref (
  app_user_id uuid primary key references app_user(id) on delete cascade,
  ends_today boolean not null default true,
  ends_soon boolean not null default true,
  new_listings boolean not null default true,
  saved_listing_ending boolean not null default true,
  winner_wall_reactions boolean not null default true,
  winner_wall_verification boolean not null default true,
  weekly_roundup boolean not null default true,
  featured_sweeps boolean not null default false,
  email_enabled boolean not null default true,
  in_app_enabled boolean not null default true,
  push_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

create table notification_log (
  id uuid primary key default gen_random_uuid(),
  app_user_id uuid not null references app_user(id) on delete cascade,
  type text not null,
  channel notification_channel not null,
  status notification_status not null default 'queued',
  sent_at timestamptz,
  created_at timestamptz not null default now()
);
create index notification_log_user_idx on notification_log (app_user_id, created_at desc);
