alter table markets
  add column if not exists active boolean,
  add column if not exists closed boolean,
  add column if not exists archived boolean,
  add column if not exists accepting_orders boolean,
  add column if not exists closed_time timestamptz,
  add column if not exists volume numeric(30, 8),
  add column if not exists volume_24h numeric(30, 8),
  add column if not exists liquidity numeric(30, 8),
  add column if not exists featured boolean,
  add column if not exists is_new boolean,
  add column if not exists competitive numeric(18, 8),
  add column if not exists one_day_price_change numeric(18, 8),
  add column if not exists one_hour_price_change numeric(18, 8),
  add column if not exists one_week_price_change numeric(18, 8),
  add column if not exists gamma_updated_at timestamptz;

create index if not exists markets_explorer_valid_idx
  on markets (end_date, id)
  where status = 'open'
    and coalesce(active, true) = true
    and coalesce(closed, false) = false
    and coalesce(archived, false) = false
    and coalesce(accepting_orders, true) = true;

create index if not exists markets_open_active_idx
  on markets (id)
  where status = 'open'
    and coalesce(active, true) = true
    and coalesce(closed, false) = false
    and coalesce(archived, false) = false
    and coalesce(accepting_orders, true) = true;
