# Probis 2.0 Data Layer Migration Readiness

## Scope

Phase 0.5 replaces the active intelligence-first backend with a bounded
prediction-market explorer foundation. The complete Probis 1 source remains
available under `legacy/probis1/`. No database reset script was executed.

## Legacy Dependency Audit

### Legacy API Routes

| Archived file | Tables referenced | Classification |
| --- | --- | --- |
| `apps/api/app/api/aggregates/route.ts` | `market_aggregates_1m` | Legacy-only aggregate API |
| `apps/api/app/api/dashboard/route.ts` | `markets`, `market_aggregates_1m`, `market_timeline`, `anomaly_events`, `wallet_profiles`, `system_status` | Legacy-only intelligence dashboard |
| `apps/api/app/api/markets/route.ts` | `markets`, `market_aggregates_1m` | Refactored into explorer market list |
| `apps/api/app/api/markets/[id]/route.ts` | `markets`, `market_aggregates_1m`, `trades`, `wallet_profiles`, `anomaly_events` | Refactored into explorer detail; intelligence joins removed |
| `apps/api/app/api/signals/route.ts` | `anomaly_events`, `markets`, `wallet_profiles` | Legacy-only signal feed |
| `apps/api/app/api/timeline/route.ts` | `market_timeline` | Legacy-only replay API |
| `apps/api/app/api/wallets/route.ts` | `wallet_profiles` | Legacy-only wallet API |
| `apps/api/app/api/wallets/[address]/route.ts` | `wallet_profiles`, `wallet_market_activity`, `trades`, `markets`, `anomaly_events`, `wallet_daily_stats` | Legacy-only wallet detail |
| `apps/api/app/api/wallets/activity/route.ts` | `wallet_daily_stats`, `wallet_profiles` | Legacy-only wallet activity |
| `apps/api/app/api/wallets/top/route.ts` | `wallet_profiles` | Legacy-only wallet ranking |
| `apps/api/app/api/health/route.ts` | none | Kept and simplified |

### Legacy Worker Modules

| Archived file or module | Tables referenced or produced | Classification |
| --- | --- | --- |
| `src/ingestion/market-discovery.ts`, `src/ingestion/market-universe.ts` | legacy `markets` universe fields | Refactored into explorer discovery |
| `src/ingestion/trade-ingestion.ts`, `src/repositories/trades.ts` | `trades` | Legacy-only |
| `src/aggregation/candles.ts`, `src/repositories/aggregates.ts` | `market_aggregates_1m` | Legacy-only |
| `src/repositories/timeline.ts` | `market_timeline` | Legacy-only |
| `src/repositories/system-status.ts` | `system_status` | Legacy-only |
| `src/intelligence/**` | `anomaly_events`, aggregates, trades | Legacy-only |
| `src/wallet-intelligence/**` | `trades`, `markets`, `wallet_profiles`, `wallet_market_activity`, `wallet_daily_stats`, `anomaly_events` | Legacy-only |
| `src/realtime/**`, `src/queues/**` | trade and replay event pipeline | Legacy-only |
| `src/normalization/polymarket.ts` | legacy normalized market and trade shape | Refactored into explorer normalization |

### Legacy Database Package

| Archived file or module | Tables referenced | Classification |
| --- | --- | --- |
| `src/schema/tables.ts` | `markets`, `trades`, `market_aggregates_1m`, `wallet_stats`, `wallet_profiles`, `wallet_market_activity`, `wallet_daily_stats`, `system_status`, `anomaly_events`, `narrative_events`, `market_timeline`, `alerts` | Replaced |
| `src/repositories/markets.ts` | legacy `markets` | Replaced by explorer sync and API reads |
| `src/repositories/trades.ts` | `trades` | Legacy-only |
| `src/repositories/wallets.ts` | `wallet_stats` | Legacy-only |
| `src/repositories/anomalies.ts` | `anomaly_events` | Legacy-only |
| `src/supabase/**` | generated legacy database shape | Legacy-only |
| `src/queries/**` | repository pagination and sorting helpers | Archived; API has explorer-specific query validation |

### Legacy Shared Types

`packages/types/src/index.ts` previously exposed dashboard, aggregate, timeline,
wallet, anomaly, signal, narrative, cross-market, and regime contracts. It is
archived and replaced with explorer-only API, venue, category, market, outcome,
metrics, history, and pagination contracts.

## Migration Plan

### A. Keep For Probis 2.0

- Database connection and migration-runner pattern.
- Gamma HTTP discovery concept.
- Structured API response envelope and request ID handling.
- Root monorepo validation commands.

### B. Refactor For Probis 2.0

- Database models: replaced with five explorer tables.
- Market discovery: simplified to venue, category, market, and outcome sync.
- Market normalization: simplified to normalized explorer metadata and explicit
  YES outcome lookup for snapshots.
- API market list and detail: rebuilt against explorer tables.
- Environment config: reduced to Gamma discovery and snapshot settings.

### C. Legacy-Only

- Raw trades and CLOB/Data API ingestion.
- Wallet profiling and coordinated-flow analytics.
- Aggregates, anomaly detection, signals, narratives, timelines, regimes, and
  system heartbeat.
- Intelligence and signal UI support packages.

## Active Explorer APIs

- `GET /api/venues`
- `GET /api/categories?venue=polymarket`
- `GET /api/markets?category=&venue=&search=&status=&limit=&offset=`
- `GET /api/markets/[id]`
- `GET /api/markets/[id]/history?from=&to=&limit=`
- `GET /api/health`

History returns an empty array when a market has no snapshots.

## Snapshot Strategy

Recommended default: one snapshot every five minutes for known markets.

| Frequency | Rows per market per day | Rows per 1,000 markets per day | Rows per 1,000 markets per 30 days |
| --- | ---: | ---: | ---: |
| 1 minute | 1,440 | 1,440,000 | 43,200,000 |
| 5 minutes | 288 | 288,000 | 8,640,000 |
| 15 minutes | 96 | 96,000 | 2,880,000 |

At roughly 160-240 bytes per row before index overhead, a five-minute cadence
for 1,000 markets is approximately 46-69 MB/day of table data, plus indexes.
Start with five minutes and add retention/downsampling before increasing
frequency. A 15-minute cadence is the low-cost fallback for large universes.

## Drop Readiness

The active API, workers, database models, and shared types no longer reference
legacy tables. The repository is code-ready for the five-table schema.

Before running `packages/database/sql/probis2-drop-schema.sql`, manually:

1. Back up any legacy data that must remain queryable.
2. Stop deployed Probis 1 workers and API instances.
3. Run the reviewed drop script.
4. Apply `packages/database/migrations/0001_probis2_foundation.sql`.
5. Start the Probis 2.0 API and workers.

After those operational checks, it is safe to execute
`probis2-drop-schema.sql`.
