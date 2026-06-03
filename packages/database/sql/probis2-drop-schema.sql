-- Probis 2.0 reset helper.
-- Review and execute manually. This file intentionally uses CASCADE because
-- the legacy intelligence schema has foreign keys, policies, and publications.

begin;

drop table if exists alerts cascade;
drop table if exists market_timeline cascade;
drop table if exists narrative_events cascade;
drop table if exists anomaly_events cascade;
drop table if exists system_status cascade;
drop table if exists wallet_daily_stats cascade;
drop table if exists wallet_market_activity cascade;
drop table if exists wallet_profiles cascade;
drop table if exists wallet_stats cascade;
drop table if exists market_aggregates_1m cascade;
drop table if exists trades cascade;

-- Probis 2.0 tables are included so the script can reset a partially applied
-- foundation migration during development.
drop table if exists market_snapshots cascade;
drop table if exists market_outcomes cascade;
drop table if exists markets cascade;
drop table if exists categories cascade;
drop table if exists venues cascade;

drop type if exists alert_type cascade;
drop type if exists timeline_event_type cascade;
drop type if exists anomaly_type cascade;
drop type if exists trade_side cascade;
drop type if exists market_status cascade;
drop type if exists market_source cascade;

commit;
