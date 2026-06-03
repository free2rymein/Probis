alter table markets
  add column if not exists sports_market_type text,
  add column if not exists game_start_time timestamptz,
  add column if not exists uma_resolution_status text,
  add column if not exists uma_resolution_statuses text[] not null default '{}',
  add column if not exists resolved_by text,
  add column if not exists ready boolean,
  add column if not exists approved boolean;
