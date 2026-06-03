create table gamma_ingestion_batches (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'gamma',
  feed_kind text not null,
  status text not null,
  started_at timestamptz not null default now(),
  fetched_at timestamptz,
  normalized_at timestamptz,
  completed_at timestamptz,
  raw_cleanup_at timestamptz,
  event_count integer not null default 0,
  market_count integer not null default 0,
  normalized_event_count integer not null default 0,
  normalized_market_count integer not null default 0,
  excluded_event_count integer not null default 0,
  excluded_market_count integer not null default 0,
  error_message text,
  timings jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint gamma_ingestion_batches_status_check check (
    status in ('started', 'fetched', 'normalized', 'failed', 'cleaned')
  )
);

create index gamma_ingestion_batches_status_started_at_idx
  on gamma_ingestion_batches (status, started_at);

create index gamma_ingestion_batches_created_at_idx
  on gamma_ingestion_batches (created_at);

create index gamma_ingestion_batches_feed_kind_started_at_idx
  on gamma_ingestion_batches (feed_kind, started_at);

create table gamma_raw_events (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references gamma_ingestion_batches(id) on delete cascade,
  feed_kind text not null,
  external_event_id text not null,
  payload jsonb not null,
  source_updated_at timestamptz,
  normalization_status text not null default 'pending',
  exclusion_reasons text[] not null default '{}'::text[],
  normalized_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  constraint gamma_raw_events_normalization_status_check check (
    normalization_status in ('pending', 'normalized', 'excluded', 'failed')
  ),
  constraint gamma_raw_events_batch_feed_event_unique unique (
    batch_id, feed_kind, external_event_id
  )
);

create index gamma_raw_events_batch_id_idx on gamma_raw_events (batch_id);
create index gamma_raw_events_external_event_id_idx on gamma_raw_events (external_event_id);
create index gamma_raw_events_normalization_status_idx on gamma_raw_events (normalization_status);
create index gamma_raw_events_created_at_idx on gamma_raw_events (created_at);

create table gamma_raw_markets (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references gamma_ingestion_batches(id) on delete cascade,
  feed_kind text not null,
  external_event_id text,
  external_market_id text not null,
  payload jsonb not null,
  source_updated_at timestamptz,
  normalization_status text not null default 'pending',
  exclusion_reasons text[] not null default '{}'::text[],
  normalized_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  constraint gamma_raw_markets_normalization_status_check check (
    normalization_status in ('pending', 'normalized', 'excluded', 'failed')
  ),
  constraint gamma_raw_markets_batch_feed_market_unique unique (
    batch_id, feed_kind, external_market_id
  )
);

create index gamma_raw_markets_batch_id_idx on gamma_raw_markets (batch_id);
create index gamma_raw_markets_external_event_id_idx on gamma_raw_markets (external_event_id);
create index gamma_raw_markets_external_market_id_idx on gamma_raw_markets (external_market_id);
create index gamma_raw_markets_normalization_status_idx on gamma_raw_markets (normalization_status);
create index gamma_raw_markets_created_at_idx on gamma_raw_markets (created_at);
