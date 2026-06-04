# Probis 2.0 Workers

Explorer-first worker runtime for normalized Polymarket discovery and bounded
market snapshots.

## Commands

```bash
pnpm --filter @probis/workers dev
pnpm --filter @probis/workers discovery:once
pnpm --filter @probis/workers lifecycle:sync-closed
pnpm --filter @probis/workers lifecycle:reconcile
pnpm --filter @probis/workers lifecycle:validate
pnpm --filter @probis/workers explorer-cards:refresh
pnpm --filter @probis/workers pipeline:once
pnpm --filter @probis/workers typecheck
pnpm --filter @probis/workers lint
```

## Active Workers

- `MarketDiscoveryWorker`: fetches Gamma events as the primary taxonomy source,
  preserves venue tags, flattens nested tradable markets, and syncs canonical
  explorer categories. Discovery intentionally persists Gamma event children
  only so stale standalone records do not pollute the explorer baseline.
- `MarketSnapshotWorker`: periodically refreshes Gamma data and writes compact
  `market_snapshots` rows for known markets.
- `LifecycleReconciliationWorker`: checks a bounded, prioritized set of locally
  open exceptions against Gamma event detail after each discovery cycle. Detail
  proof is a fallback for rows not corrected by the closed-feed batch sync.

## Cost Strategy

The foundation does not ingest raw trades, wallets, signals, anomalies, or
narratives. Snapshot frequency defaults to five minutes to provide useful
charts without creating a high-frequency storage obligation.

## Live Mode

Live mode discovers active Polymarket markets through Gamma. Apply the Probis
2.0 schema reset and foundation migration manually before starting the worker.

## Taxonomy Migration And Backfill

Stop any running worker before applying `0002_probis2_taxonomy.sql`. The
migration adds event and tag relationships without deleting existing markets.
Restarting discovery performs an idempotent backfill through upserts:

```bash
pnpm --filter @probis/database db:migrate
pnpm --filter @probis/workers discovery:once
```

`0008_probis2_sports_lifecycle.sql` adds compact Gamma lifecycle fields for
completed-sports filtering. After migration and one-shot discovery, run:

```bash
pnpm --filter @probis/workers lifecycle:validate
```

`0009_probis2_lifecycle_reconciliation.sql` adds compact event lifecycle truth
and bounded reconciliation timestamps. Discovery runs reconciliation
automatically; it can also be run independently:

```bash
pnpm --filter @probis/database db:migrate
pnpm --filter @probis/workers discovery:once
pnpm --filter @probis/workers lifecycle:reconcile
pnpm --filter @probis/workers lifecycle:validate
```

```env
LIFECYCLE_RECONCILE_LIMIT=25
LIFECYCLE_RECONCILE_CONCURRENCY=5
LIFECYCLE_RECONCILE_STALE_MINUTES=60
CLOSED_EVENT_PAGE_LIMIT=100
CLOSED_EVENT_MAX_PAGES=10
OPEN_FEED_STALE_GRACE_MINUTES=60
STALE_CLOSE_END_DATE_BUFFER_HOURS=6
ENABLE_SET_BASED_STALE_CLOSE=false
```

Each discovery cycle stamps all open-feed rows with one run timestamp, syncs
recently closed Gamma events through set-based parent and child updates, and
reports conservative stale candidates. Set-based stale closure remains disabled
by default until its dry-run counts are reviewed.

The API event explorer uses a configurable Balanced quality profile by
default. These filters apply to event groups only, not child markets:

```env
MIN_EVENT_VOLUME=5000
MIN_EVENT_LIQUIDITY=500
MIN_EVENT_VOLUME_24H=0
```

The recommended Probis 2.0 API runtime reads `/api/events` and
`/api/categories` from `explorer_event_cards` with legacy fallback:

```env
EVENTS_QUERY_MODE=read-model-with-legacy-fallback
```

Force the legacy dynamic query path only when debugging or recovering from a
read-model issue:

```env
EVENTS_QUERY_MODE=legacy
```

If `explorer_event_cards` is empty or stale, rebuild the full pipeline:

```bash
corepack pnpm --filter @probis/workers run pipeline:once
```

The recommended full-pipeline normalization path is the database stored
procedure. It stages open and closed Gamma event feeds, normalizes the open
feed into core explorer tables, reconciles closed-feed lifecycle state, then
refreshes `explorer_event_cards`. The TypeScript `staging-db` and `memory`
paths remain available for debugging and parity checks:

```env
PIPELINE_NORMALIZATION_SOURCE=stored-procedure
```

Per-event Gamma detail reconciliation remains a separate fallback worker for
edge cases not proven by the staged closed feed:

```bash
corepack pnpm --filter @probis/workers run lifecycle:reconcile
```

Check basic API and database health:

```bash
curl http://localhost:3001/api/health
```

Raw Gamma staging payloads are useful when debugging failed normalization runs.
By default, successful pipeline runs retain the latest successful raw batches:

```env
RAW_STAGING_CLEANUP_MODE=retain-latest
```

For Supabase-constrained environments, a successful pipeline can remove all raw
staging payloads after `explorer_event_cards` refreshes. This keeps
`gamma_ingestion_batches` metadata but truncates `gamma_raw_events` and
`gamma_raw_markets`. The UI and API do not depend on raw staging rows after the
read model refresh succeeds:

```env
RAW_STAGING_CLEANUP_MODE=truncate-after-success
```

For a local development reset, truncating explorer tables remains an explicit
manual operation. It is not required for the normal taxonomy backfill. If
stale pre-taxonomy rows make local validation confusing, stop the worker,
review and run `packages/database/sql/probis2-reset-explorer-data.sql`, then
run the full pipeline to rebuild staging, normalized explorer data, and
`explorer_event_cards`.

The guarded command form requires an explicit confirmation token:

```bash
PROBIS_DEV_RESET_CONFIRM=RESET_PROBIS2_EXPLORER_DATA pnpm --filter @probis/database db:reset:explorer
corepack pnpm --filter @probis/workers run pipeline:once
```

`0003_probis2_event_explorer.sql` adds compact event-level metrics and
classification fields for grouped browsing. Apply migrations before starting
the worker:

```bash
pnpm --filter @probis/database db:migrate
```

After a development reset and the first discovery cycle, validate grouped
coverage:

```sql
select c.name, count(*) as event_count
from events e
join categories c on c.id = e.primary_category_id
where e.active = true and e.closed = false and e.archived = false
group by c.name
order by event_count desc;

select count(*) from events;
select count(*) from event_markets;
select count(*) from event_tags;
```
