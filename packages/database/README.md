# @probis/database

Production database layer for Probis.

This package owns:

- Drizzle PostgreSQL schema definitions
- SQL migrations
- migration runner
- typed Supabase clients
- typed Drizzle database client
- reusable repositories
- pagination and sorting helpers

## Setup

Required environment variables:

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/probis
REDIS_URL=redis://localhost:6379
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

Run migrations:

```bash
pnpm --filter @probis/database db:migrate
```

Generate future Drizzle migrations:

```bash
pnpm --filter @probis/database db:generate
```

Open Drizzle Studio:

```bash
pnpm --filter @probis/database db:studio
```

## Schema Strategy

`markets` stores normalized prediction market metadata with stable `source + external_id` identity.

`trades` is the high-throughput append-only ingestion table. It is partitioned by `trade_timestamp` and uses a composite primary key `(id, trade_timestamp)` so PostgreSQL can enforce uniqueness on partitioned data. Create partitions ahead of time with:

```sql
select create_trade_partition_month('2026-06-01'::date);
```

`market_aggregates_1m` is the primary UI datasource. Most dashboards should read aggregates instead of raw trades.

`wallet_stats` stores precomputed wallet intelligence so expensive scoring does not happen in request paths.

`anomaly_events` is the main intelligence event table. Keep summaries compact and structured metadata bounded.

`narrative_events` stores external timeline events for narrative correlation.

`market_timeline` powers replay by storing normalized event payloads in timestamp order.

`alerts` is RLS-ready for user-specific alert policies.

## Indexing Strategy

- Raw trade drilldowns: `(market_id, trade_timestamp)`, `wallet_address`, `trade_timestamp DESC`
- UI charts: `(market_id, bucket)` on `market_aggregates_1m`
- Wallet leaderboards: `reputation_score DESC`, `information_advantage_score DESC`
- Intelligence feed: `severity_score DESC, detected_at DESC`, `anomaly_type`
- Narrative filtering: `event_timestamp DESC`, `tags` GIN
- Replay: `(market_id, event_timestamp)`

## Realtime Strategy

The migration adds realtime-compatible tables to `supabase_realtime` when the publication exists:

- `markets`
- `market_aggregates_1m`
- `anomaly_events`
- `market_timeline`
- `alerts`

Raw `trades` is intentionally not added to realtime by default. Stream aggregate and anomaly updates to clients; keep raw trade firehoses in workers or specialized channels.

## RLS Strategy

RLS is enabled on every table. Policies are intentionally deferred until auth roles and tenancy boundaries are finalized.

Expected direction:

- public or authenticated read policies for market metadata
- service-role writes for ingestion, aggregates, anomalies, and timeline
- user-owned policies for `alerts`
- no browser writes to raw intelligence tables

## Low-Cost Storage Strategy

Hot storage:

- recent trade partitions
- current 1m aggregates
- recent anomaly and timeline events

Warm storage:

- older aggregates
- compact replay windows
- wallet snapshots

Cold archival:

- detach old `trades_*` partitions
- export to Parquet in object storage
- query cold data through batch jobs or a warehouse only when needed

Keep UI paths aggregate-first. Use raw trades only for drilldown, replay reconstruction, and worker jobs.
