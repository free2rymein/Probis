alter table markets
  add column if not exists enable_order_book boolean;

alter table market_outcomes
  add column if not exists external_token_id text;

drop index if exists markets_explorer_valid_idx;
drop index if exists markets_open_active_idx;

create index markets_explorer_valid_idx
  on markets (end_date, id)
  where status = 'open'
    and active = true
    and closed = false
    and archived = false
    and accepting_orders = true
    and enable_order_book = true;

create index markets_open_active_idx
  on markets (id)
  where status = 'open'
    and active = true
    and closed = false
    and archived = false
    and accepting_orders = true
    and enable_order_book = true;
