create index if not exists markets_open_id_idx
  on markets (id)
  where status = 'open';
