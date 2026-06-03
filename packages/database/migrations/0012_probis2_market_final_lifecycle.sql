alter table markets
  add column if not exists resolved boolean,
  add column if not exists period text,
  add column if not exists finished_timestamp timestamptz;
