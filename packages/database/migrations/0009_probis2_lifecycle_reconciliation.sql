alter table events
  add column if not exists closed_time timestamptz,
  add column if not exists live boolean,
  add column if not exists ended boolean,
  add column if not exists period text,
  add column if not exists finished_timestamp timestamptz,
  add column if not exists score text,
  add column if not exists automatically_resolved boolean,
  add column if not exists gamma_updated_at timestamptz,
  add column if not exists last_lifecycle_checked_at timestamptz,
  add column if not exists last_seen_in_open_feed_at timestamptz;

alter table markets
  add column if not exists automatically_resolved boolean,
  add column if not exists last_lifecycle_checked_at timestamptz,
  add column if not exists last_seen_in_open_feed_at timestamptz;

create index if not exists events_lifecycle_reconcile_idx
  on events (last_lifecycle_checked_at, last_seen_in_open_feed_at, end_date)
  where active = true and closed = false and archived = false;
