create index gamma_raw_events_pending_batch_created_id_idx
  on gamma_raw_events (batch_id, created_at, id)
  where normalization_status = 'pending';

create index gamma_raw_markets_pending_batch_created_id_idx
  on gamma_raw_markets (batch_id, created_at, id)
  where normalization_status = 'pending';
