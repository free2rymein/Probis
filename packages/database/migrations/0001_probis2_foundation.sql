create extension if not exists pgcrypto;

create table venues (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  created_at timestamptz not null default now()
);

create table categories (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references venues(id) on delete cascade,
  slug text not null,
  name text not null,
  created_at timestamptz not null default now(),
  constraint categories_venue_slug_unique unique (venue_id, slug)
);

create index categories_venue_id_idx on categories (venue_id);

create table markets (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references venues(id) on delete cascade,
  external_market_id text not null,
  slug text not null,
  title text not null,
  description text,
  category_id uuid references categories(id) on delete set null,
  status text not null default 'open',
  end_date timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint markets_status_check check (
    status in ('draft', 'open', 'paused', 'closed', 'resolved', 'archived')
  ),
  constraint markets_venue_external_market_unique unique (venue_id, external_market_id),
  constraint markets_venue_slug_unique unique (venue_id, slug)
);

create index markets_venue_id_idx on markets (venue_id);
create index markets_category_id_idx on markets (category_id);
create index markets_status_end_date_idx on markets (status, end_date);

create table market_outcomes (
  id uuid primary key default gen_random_uuid(),
  market_id uuid not null references markets(id) on delete cascade,
  outcome_name text not null,
  probability numeric(12, 8),
  volume numeric(30, 8) not null default 0,
  rank integer not null default 0,
  updated_at timestamptz not null default now(),
  constraint market_outcomes_probability_check check (
    probability is null or (probability >= 0 and probability <= 1)
  ),
  constraint market_outcomes_market_name_unique unique (market_id, outcome_name)
);

create index market_outcomes_market_id_idx on market_outcomes (market_id);
create index market_outcomes_market_rank_idx on market_outcomes (market_id, rank);

create table market_snapshots (
  id uuid primary key default gen_random_uuid(),
  market_id uuid not null references markets(id) on delete cascade,
  snapshot_time timestamptz not null,
  probability numeric(12, 8),
  volume numeric(30, 8),
  liquidity numeric(30, 8),
  open_interest numeric(30, 8),
  constraint market_snapshots_probability_check check (
    probability is null or (probability >= 0 and probability <= 1)
  ),
  constraint market_snapshots_market_time_unique unique (market_id, snapshot_time)
);

create index market_snapshots_market_id_idx on market_snapshots (market_id);
create index market_snapshots_snapshot_time_idx on market_snapshots (snapshot_time desc);
create index market_snapshots_market_time_idx on market_snapshots (market_id, snapshot_time desc);
