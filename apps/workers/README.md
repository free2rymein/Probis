# Probis Workers

TypeScript worker runtime for market discovery, realtime trade ingestion, normalization, incremental aggregation, and replay-ready event writing.

## Commands

```bash
pnpm --filter @probis/workers dev
pnpm --filter @probis/workers dev:mock
pnpm --filter @probis/workers typecheck
pnpm --filter @probis/workers lint
```

## Architecture

- `config`: environment-driven runtime settings
- `services`: Polymarket client, database connection, mock source
- `ingestion`: market discovery and trade ingestion loops
- `normalization`: source-specific adapters into normalized Probis events
- `aggregation`: incremental 1-minute candle computation
- `queues`: bounded batch flushing for low write amplification
- `repositories`: typed Drizzle persistence for markets, trades, aggregates, and timeline events
- `realtime`: in-process event bus prepared for Redis/Supabase realtime fanout

## Cost Strategy

Workers batch writes, deduplicate trades by transaction hash before insert, and aggregate incrementally in memory before upserting `market_aggregates_1m`. UI paths should consume aggregates and anomaly events instead of raw trades.

## Mock Mode

Mock mode creates a deterministic local market and emits synthetic trades for pipeline testing:

```bash
WORKER_MODE=mock pnpm --filter @probis/workers dev
```

## Live Mode

Live mode discovers active Polymarket markets through Gamma and polls CLOB trades. `POLYMARKET_WS_URL` can be set when a supported websocket endpoint is available; polling remains the fallback.
