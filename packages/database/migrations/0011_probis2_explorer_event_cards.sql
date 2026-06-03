create table explorer_event_cards (
  event_id uuid primary key references events(id) on delete cascade,
  external_event_id text,
  venue_id uuid references venues(id) on delete set null,
  venue_slug text not null,
  venue_name text,
  event_slug text,
  title text not null,
  search_text text,
  category_id uuid references categories(id) on delete set null,
  category_slug text,
  category_name text,
  tags jsonb not null default '[]'::jsonb,
  volume numeric,
  volume_24h numeric,
  liquidity numeric,
  open_interest numeric,
  end_date timestamptz,
  event_updated_at timestamptz,
  market_count integer not null default 0,
  top_markets jsonb not null default '[]'::jsonb,
  leader_outcome jsonb,
  same_resolution_date boolean,
  outcome_ordering text,
  is_explorer_visible boolean not null default true,
  hidden_from_new boolean not null default false,
  exclusion_reasons text[] not null default '{}'::text[],
  refresh_generation uuid not null,
  refreshed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index explorer_event_cards_venue_visible_idx
  on explorer_event_cards (venue_slug, is_explorer_visible);

create index explorer_event_cards_category_visible_idx
  on explorer_event_cards (category_slug, is_explorer_visible);

create index explorer_event_cards_visible_default_ranking_idx
  on explorer_event_cards (
    is_explorer_visible,
    volume_24h desc,
    volume desc,
    liquidity desc,
    open_interest desc
  );

create index explorer_event_cards_visible_end_date_idx
  on explorer_event_cards (is_explorer_visible, end_date);

create index explorer_event_cards_visible_event_updated_at_idx
  on explorer_event_cards (is_explorer_visible, event_updated_at desc);

create index explorer_event_cards_refresh_generation_idx
  on explorer_event_cards (refresh_generation);
