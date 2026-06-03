create table events (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references venues(id) on delete cascade,
  external_event_id text not null,
  slug text not null,
  title text not null,
  description text,
  start_date timestamptz,
  end_date timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint events_venue_external_event_unique unique (venue_id, external_event_id),
  constraint events_venue_slug_unique unique (venue_id, slug)
);

create index events_venue_id_idx on events (venue_id);

create table event_markets (
  event_id uuid not null references events(id) on delete cascade,
  market_id uuid not null references markets(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint event_markets_event_market_unique unique (event_id, market_id)
);

create index event_markets_event_id_idx on event_markets (event_id);
create index event_markets_market_id_idx on event_markets (market_id);

create table venue_tags (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references venues(id) on delete cascade,
  external_tag_id text,
  slug text not null,
  label text not null,
  raw_type text,
  created_at timestamptz not null default now(),
  constraint venue_tags_venue_slug_unique unique (venue_id, slug)
);

create index venue_tags_venue_id_idx on venue_tags (venue_id);

create table event_tags (
  event_id uuid not null references events(id) on delete cascade,
  tag_id uuid not null references venue_tags(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint event_tags_event_tag_unique unique (event_id, tag_id)
);

create index event_tags_event_id_idx on event_tags (event_id);
create index event_tags_tag_id_idx on event_tags (tag_id);

create table market_tags (
  market_id uuid not null references markets(id) on delete cascade,
  tag_id uuid not null references venue_tags(id) on delete cascade,
  source text not null,
  created_at timestamptz not null default now(),
  constraint market_tags_market_tag_source_unique unique (market_id, tag_id, source)
);

create index market_tags_market_id_idx on market_tags (market_id);
create index market_tags_tag_id_idx on market_tags (tag_id);

create table market_categories (
  market_id uuid not null references markets(id) on delete cascade,
  category_id uuid not null references categories(id) on delete cascade,
  is_primary boolean not null default false,
  source text not null,
  confidence numeric(5, 4) not null,
  created_at timestamptz not null default now(),
  constraint market_categories_confidence_check check (confidence >= 0 and confidence <= 1),
  constraint market_categories_market_category_source_unique unique (market_id, category_id, source)
);

create index market_categories_market_id_idx on market_categories (market_id);
create index market_categories_category_id_idx on market_categories (category_id);

alter table markets
  add column primary_category_id uuid references categories(id) on delete set null;

update markets set primary_category_id = category_id where primary_category_id is null;

create index markets_primary_category_id_idx on markets (primary_category_id);
