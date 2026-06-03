alter table events
  add column primary_category_id uuid references categories(id) on delete set null,
  add column active boolean not null default true,
  add column closed boolean not null default false,
  add column archived boolean not null default false,
  add column volume numeric(30, 8),
  add column volume_24h numeric(30, 8),
  add column liquidity numeric(30, 8),
  add column open_interest numeric(30, 8);

alter table markets
  add column group_item_title text;

create index events_primary_category_id_idx on events (primary_category_id);
create index events_active_end_date_idx on events (active, closed, archived, end_date);
create index events_volume_idx on events (volume desc nulls last);
