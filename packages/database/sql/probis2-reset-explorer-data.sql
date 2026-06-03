-- Development-only Probis 2.0 explorer reset.
-- Stop apps/workers before running this script, then restart discovery.
-- This removes normalized explorer data only. It does not drop schema objects.

begin;

truncate table
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
  venues;

commit;
