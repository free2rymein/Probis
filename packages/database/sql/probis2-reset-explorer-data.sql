-- Development-only Probis 2.0 explorer reset.
-- Stop apps/workers before running this script, then rebuild with the ingestion pipeline.
-- This removes Probis 2.0 explorer, staging, and read-model data.
-- It does not drop schema objects, migrations, extensions, functions, or indexes.

begin;

truncate table
  gamma_raw_markets,
  gamma_raw_events,
  gamma_ingestion_batches,
  explorer_event_cards,
  market_snapshots,
  market_outcomes,
  market_tags,
  market_categories,
  event_tags,
  event_markets,
  venue_tags,
  events,
  markets,
  categories,
  venues
restart identity cascade;

commit;
