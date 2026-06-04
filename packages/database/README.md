# @probis/database

Probis 2.0 starts with a deliberately small explorer-first schema. The earlier
intelligence schema is preserved in `migrations-legacy/` and documented in
`README-legacy.md`.

## Why The Schema Is Smaller

The first Probis 2.0 product surface is a prediction market explorer. Its core
jobs are venue discovery, category browsing, market lookup, outcome display,
and lightweight chart retrieval. Wallets, trades, signals, narratives, and
anomaly storage are intentionally deferred until the corresponding product
phases return.

This keeps the initial data model easy to reason about and prevents an
intelligence-first ingestion pipeline from setting the storage budget for the
explorer.

## Foundation Tables

- `venues`: normalized prediction-market providers.
- `categories`: venue-scoped discovery groupings.
- `markets`: normalized market metadata and lifecycle state.
- `market_outcomes`: latest outcome probabilities and volumes.
- `market_snapshots`: compact chart points for market-level time series.
- `events`: venue event groupings used as the primary Polymarket taxonomy
  source.
- `venue_tags`, `event_tags`, and `market_tags`: normalized source taxonomy
  without raw payload storage.
- `market_categories`: canonical explorer classifications with an explicit
  primary category cached on `markets.primary_category_id`.

`market_snapshots` is optimized for chart reads through
`(market_id, snapshot_time desc)`. There is no raw trade table in the Probis 2.0
foundation.

## Storage Philosophy

- Store normalized market facts, not raw provider payloads.
- Keep current outcome state separate from historical chart samples.
- Prefer bounded snapshots over raw event firehoses.
- Add intelligence tables only when a product phase proves they are needed.
- Keep legacy migrations for reference; do not apply them to a new Probis 2.0
  database.

## Snapshot Retention

Start with a bounded retention policy:

- Keep dense snapshots for recent chart windows.
- Downsample older snapshots before long-term retention.
- Delete historical samples that no longer support a product chart or
  operational requirement.

The first implementation should choose snapshot cadence and retention after
measuring provider update rates. The schema intentionally does not force a
high-frequency schedule.

## Applying The Reset

`sql/probis2-drop-schema.sql` is a manual reset helper. Review it before running
it against any environment. It drops the legacy intelligence schema with
`CASCADE` and is never executed automatically.

For a development-only Probis 2.0 explorer data reset, use the guarded reset
command instead. It truncates explorer, staging, and read-model data without
dropping schema objects:

```bash
PROBIS_DEV_RESET_CONFIRM=RESET_PROBIS2_EXPLORER_DATA corepack pnpm --filter @probis/database run db:reset:explorer
corepack pnpm --filter @probis/workers run pipeline:once
```

`pipeline:once` defaults to stored-procedure normalization. The older
TypeScript `staging-db` and `memory` normalization sources remain available for
debugging and parity checks.

If the API needs to remain available while debugging read-model data, force the
legacy dynamic query path:

```bash
EVENTS_QUERY_MODE=legacy pnpm dev:api
```

`migrations/0001_probis2_foundation.sql` creates the fresh explorer foundation.
The existing backend TypeScript schema still targets the preserved legacy
engine and must be adapted in a later implementation phase before the reset is
applied to a shared environment.
