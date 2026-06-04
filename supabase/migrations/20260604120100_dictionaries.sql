-- Admin-managed controlled dictionaries (growable sets) as tables.
-- Shape per Canonical Data Model section 12: code, label, is_active, display_priority.

create table category (
  code text primary key,
  label text not null,
  is_active boolean not null default true,
  display_priority int not null default 100,
  created_at timestamptz not null default now()
);

create table tag (
  code text primary key,
  label text not null,
  category_code text references category(code),
  is_active boolean not null default true,
  display_priority int not null default 100,
  created_at timestamptz not null default now()
);

create table badge (
  code text primary key,
  label text not null,
  badge_group text not null,
  is_active boolean not null default true,
  display_priority int not null default 100,
  created_at timestamptz not null default now()
);

create table eligibility (
  code text primary key,
  label text not null,
  is_active boolean not null default true,
  display_priority int not null default 100,
  created_at timestamptz not null default now()
);
