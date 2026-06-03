# Probis 2.0 Codex Handover

**Prepared:** June 1, 2026  
**Repository:** `D:\Aashish\Projects\Probis`  
**Current active phase:** UI-1.7 - Runtime Profiling, Market Lifecycle Audit, and Volume Distribution Audit  
**Primary database:** Supabase/Postgres development project configured through `DATABASE_URL`

---

## 1. Executive Summary

Probis 2.0 is a UI-first prediction-market explorer. The current product is deliberately focused on making Polymarket discovery fast, clear, and reliable before reintroducing any intelligence features.

Probis 1 is preserved as an archived intelligence-engine reference. It previously included wallet intelligence, anomalies, signals, narratives, regimes, dashboards, and related analytics. Do not delete it. Do not copy those features into Probis 2.0 yet.

The current Probis 2.0 product surface supports:

- Venue selection.
- Event-first Polymarket discovery.
- Dynamic category navigation.
- Search, sorting, pagination, and grid/list browsing.
- Event detail pages with grouped associated markets.
- Market detail pages with snapshot charts.
- Strict tradability filtering.
- Correct YES/NO outcome mapping.
- Compact normalized storage without raw trade history.

The immediate next concern is correctness: completed sports-market artifacts still appear because Gamma continues to publish some completed-match contracts as active, open, tradable, and future-dated during resolution. After that, optimize explorer hydration and initial page data delivery.

---

## 2. Product Vision And Scope

### Product vision

Probis 2.0 should feel like a modern prediction-market explorer closer to Polymarket, GoCharting, Robinhood, and Perplexity than to an internal analytics dashboard.

### Current scope

- Polymarket first.
- Kalshi is a visible future venue placeholder.
- Explorer UX, taxonomy, data quality, lifecycle correctness, and performance.
- Light theme by default with dark-mode support.
- Mobile-first responsive layouts.

### Not in scope yet

Do not build or reintroduce:

- Signals.
- Wallet analytics.
- Smart money.
- Anomalies.
- Narratives.
- Regimes.
- Alerts.
- AI summaries.
- Large raw trade ingestion.
- Heavy intelligence tables.
- Vector databases or ML clustering.

Future intelligence phases may layer these features onto Probis 2.0 after the explorer foundation is stable.

---

## 3. Architecture Overview

```text
Gamma /events API
      |
      v
apps/workers
  - MarketDiscoveryWorker
  - MarketSnapshotWorker
      |
      v
Supabase/Postgres
  - normalized venues, categories, events, markets, outcomes, tags, snapshots
      |
      v
apps/api
  - explorer APIs
  - short server-side cache
      |
      v
apps/web-v2
  - Next.js explorer UI
```

### Architectural decisions

- Gamma `/events` is the primary ingestion source because Polymarket taxonomy and nested market grouping live there.
- Event cards are the explorer's top-level browsing unit.
- Nested markets remain available for event-detail and market-detail routes.
- Standalone broad `/markets` ingestion should be avoided unless justified.
- Store normalized facts, not raw Gamma payloads.
- Keep raw history bounded through compact snapshots.
- Child-market joins should remain limited to strict visibility checks, selected-event preview hydration, and event-detail associated markets.

---

## 4. Repository Structure

| Path | Purpose |
|---|---|
| `apps/web-v2` | Active Probis 2.0 frontend. Next.js App Router, TypeScript, Tailwind, shadcn-style UI primitives. |
| `apps/api` | Active explorer API. Next.js route handlers backed by Postgres. |
| `apps/workers` | Active Probis 2.0 discovery and snapshot workers. |
| `packages/database` | Drizzle schema, migrations, reset helpers, and database documentation. |
| `packages/types` | Shared API and domain types. |
| `packages/shared` | Shared utilities. |
| `apps/web-legacy` | Archived Probis 1 UI reference. Do not modify casually. |
| `legacy/probis1` | Archived Probis 1 backend/intelligence-engine reference. |
| `packages/database/migrations-legacy` | Archived Probis 1 migrations. Do not apply to Probis 2.0. |
| `.artifacts/ui-1.5` | Prior UI screenshot artifacts. |
| `PROBIS2_*.md` | Roadmap, UX architecture, component system, navigation, theme, and migration notes. |

### Active API routes

```text
GET /api/health
GET /api/venues
GET /api/categories
GET /api/events
GET /api/events/[id]
GET /api/markets
GET /api/markets/[id]
GET /api/markets/[id]/history
```

### Active frontend routes

```text
/
/markets
/events/[id]
/markets/[id]
```

---

## 5. Database Schema

The Probis 2.0 schema is intentionally compact.

| Table | Purpose | Important fields |
|---|---|---|
| `venues` | Prediction-market venues. | `id`, `slug`, `name`, `created_at` |
| `categories` | Canonical venue-scoped explorer categories. | `id`, `venue_id`, `slug`, `name` |
| `events` | Parent event groups used by the explorer. | `external_event_id`, `title`, `primary_category_id`, `active`, `closed`, `archived`, `volume`, `volume_24h`, `liquidity`, `open_interest`, `end_date` |
| `markets` | Child prediction markets. | `external_market_id`, `title`, `group_item_title`, lifecycle booleans, metrics, Gamma price-change fields, `gamma_updated_at` |
| `market_outcomes` | Current outcome state. | `market_id`, `outcome_name`, `external_token_id`, `probability`, `volume`, `rank` |
| `market_snapshots` | Compact chart history. | `market_id`, `snapshot_time`, `probability`, `volume`, `liquidity`, `open_interest` |
| `venue_tags` | Lossless normalized Gamma tags. | `venue_id`, `external_tag_id`, `slug`, `label`, `raw_type` |
| `event_markets` | Event-to-market relation. | `event_id`, `market_id` |
| `event_tags` | Event-to-tag relation. | `event_id`, `tag_id` |
| `market_tags` | Market-to-tag relation. | `market_id`, `tag_id`, `source` |
| `market_categories` | Classification records. | `market_id`, `category_id`, `is_primary`, `source`, `confidence` |

### Current lifecycle columns stored on `markets`

```text
status
active
closed
archived
accepting_orders
enable_order_book
closed_time
end_date
```

### Current Gamma metric columns stored on `markets`

```text
volume
volume_24h
liquidity
featured
is_new
competitive
one_day_price_change
one_hour_price_change
one_week_price_change
gamma_updated_at
```

### Important missing lifecycle metadata

UI-1.7 found useful Gamma fields that are exposed but not yet stored:

```text
sportsMarketType
gameStartTime
umaResolutionStatus
umaResolutionStatuses
resolvedBy
ready
approved
```

These should be considered in the next lifecycle-filtering phase.

---

## 6. Migration History

| Migration | Purpose |
|---|---|
| `0001_probis2_foundation.sql` | Creates the explorer-first foundation: venues, categories, markets, outcomes, and snapshots. |
| `0002_probis2_taxonomy.sql` | Adds events, event-market relations, venue tags, event tags, market tags, market categories, and primary-category support. |
| `0003_probis2_event_explorer.sql` | Adds event explorer metrics and grouping support. |
| `0004_probis2_explorer_performance.sql` | Adds explorer-performance indexes and fields needed by event browsing. |
| `0005_probis2_open_market_lookup.sql` | Adds open-market lookup support. |
| `0006_probis2_market_lifecycle.sql` | Adds market lifecycle and metric columns. |
| `0007_probis2_strict_tradable_markets.sql` | Adds `enable_order_book`, strict tradability indexes, and `external_token_id` on outcomes. |

Manual SQL helpers:

```text
packages/database/sql/probis2-drop-schema.sql
packages/database/sql/probis2-reset-explorer-data.sql
```

`probis2-drop-schema.sql` must never be executed automatically.

---

## 7. Important Commands

Run commands from:

```text
D:\Aashish\Projects\Probis
```

### Install and validate

```bash
corepack pnpm install
corepack pnpm typecheck
corepack pnpm lint
corepack pnpm build
```

### Run services

```bash
corepack pnpm --filter @probis/api dev
corepack pnpm --filter @probis/workers dev
corepack pnpm --filter @probis/web dev
```

The web package defaults to port `3000`. During current local testing, the explorer has often been launched explicitly on port `3010`:

```bash
corepack pnpm --filter @probis/web exec next dev --port 3010
```

API URL:

```text
http://localhost:3001
```

Explorer URL when launched on port `3010`:

```text
http://localhost:3010/markets
```

### Database

```bash
corepack pnpm --filter @probis/database run db:migrate
corepack pnpm --filter @probis/database run db:studio
```

Safe explorer reset is guarded by an explicit confirmation variable:

```powershell
$env:PROBIS_DEV_RESET_CONFIRM='RESET_PROBIS2_EXPLORER_DATA'
corepack pnpm --filter @probis/database run db:reset:explorer
```

Equivalent SQL helper:

```text
packages/database/sql/probis2-reset-explorer-data.sql
```

Reset only explorer tables, then rerun discovery. Do not drop shared schemas casually.

### Useful manual API checks

```text
http://localhost:3001/api/events?venue=polymarket&limit=50&offset=0&sort=trending
http://localhost:3001/api/categories?venue=polymarket
http://localhost:3001/api/events?venue=polymarket&limit=100&search=Iran
```

---

## 8. Current Ingestion Approach

### Workers retained

#### `MarketDiscoveryWorker`

Responsibilities:

- Fetch Gamma `/events`.
- Normalize event tags and nested markets.
- Persist venue, canonical categories, events, tags, markets, relations, and outcomes.
- Log event coverage, categories, exclusions, and duration.

#### `MarketSnapshotWorker`

Responsibilities:

- Periodically snapshot known markets.
- Store compact probability, volume, liquidity, and open-interest points.
- Keep chart history bounded.

### Discovery configuration defaults

```env
POLYMARKET_GAMMA_API_URL=https://gamma-api.polymarket.com
POLYMARKET_EVENT_PAGE_LIMIT=100
POLYMARKET_EVENT_MAX_PAGES=10
MARKET_DISCOVERY_INTERVAL_MS=900000
MARKET_SNAPSHOT_INTERVAL_MS=300000
HTTP_TIMEOUT_MS=15000
```

### Gamma event pagination

- `/events` is fetched as the primary source.
- Page limit: `100`.
- Max pages: `10`.
- Up to `1,000` events per discovery cycle initially.
- Pages are fetched concurrently in safe batches of `3`.
- Pagination stops when a page returns fewer than the configured limit.

### Standalone markets

`fetchActiveMarkets()` still exists in the client for optional use, but the current discovery worker persists nested markets from `/events` and passes an empty standalone-market list. Avoid broad standalone `/markets` ingestion unless a specific coverage gap justifies it.

---

## 9. Taxonomy And Categories

Gamma `/events` tags are the primary source of Polymarket taxonomy. Tags are persisted losslessly in `venue_tags`, related through `event_tags`, and mapped into canonical Probis explorer categories.

Canonical categories:

```text
Politics
Geopolitics
Macro
Crypto
Technology
Sports
Culture
Science
Weather
Other
```

Classification precedence:

1. Event and market tag slugs/labels.
2. Market category, question, title, and description fallback.
3. `Other`.

Do not default markets to Crypto. Avoid `Uncategorized`; use `Other` when necessary.

The sidebar reads dynamic API categories and counts active event groups, not static fake labels.

---

## 10. Strict Explorer-Valid Market Filter

Current reusable predicate:

```sql
status = 'open'
and active = true
and closed = false
and archived = false
and accepting_orders = true
and enable_order_book = true
and end_date >= now()
```

Source:

```text
apps/api/lib/explorer-market-filter.ts
```

This predicate must remain the baseline strict tradability check. Future lifecycle rules should extend it carefully rather than weaken it.

Completed fixes:

- Removed stale and expired markets.
- Added and enforced `enable_order_book`.
- Added token persistence through `market_outcomes.external_token_id`.
- Stored token IDs from Gamma `clobTokenIds`.
- Explicit YES outcome mapping; do not assume array ordering.

---

## 11. Outcome Ordering Logic

Reusable ordering helper:

```text
apps/api/lib/outcome-ordering.ts
```

Rules:

### Same resolution date

If all associated markets within an event group resolve on the same date:

```text
sort by current YES probability DESC
```

Example:

```text
France   17%
Spain    17%
England  15%
```

### Mixed resolution dates

If associated markets use different resolution dates:

```text
sort by resolution date ASC
```

Example:

```text
By May 31
By Jun 30
By Dec 31
```

This logic is shared by:

- Explorer cards.
- Event detail associated-market rows.
- Event leader and preview calculations.

Validated examples:

- `Democratic Presidential Nominee 2028`: probability ordering.
- `US x Iran permanent peace deal by...?`: `June 7`, `June 15`, `July 31`.

---

## 12. UI Work Completed

### Phase 0

- Archived Probis 1 UI as `apps/web-legacy`.
- Preserved legacy backend/intelligence reference under `legacy/probis1`.
- Created `apps/web-v2`.
- Created drop-schema and fresh foundation migration.

### Phase 0.5

- Refactored backend for explorer-first schema.
- Retained only market discovery and snapshot workers.
- Replaced legacy APIs with explorer APIs.

### UI-0

- Created UX architecture documents:

```text
PROBIS2_UX_ARCHITECTURE.md
PROBIS2_COMPONENT_SYSTEM.md
PROBIS2_NAVIGATION_MAP.md
PROBIS2_THEME_SYSTEM.md
```

### UI-1

- Built landing page, market explorer, event detail foundation, and market detail foundation.
- Added light/dark themes.
- Added responsive sidebar/drawer and mobile behavior.
- Added charts using Recharts.

### UI-1.1

- Switched taxonomy ingestion to Gamma `/events`.
- Added dynamic category sidebar counts.
- Preserved Polymarket event tags.

### UI-1.2

- Changed explorer from market-first cards to event/group cards.
- Added top associated-market previews.
- Added event detail route.
- Excluded closed, resolved, expired, archived, and non-tradable child markets.

### UI-1.3

- Added robust event pagination.
- Improved discovery speed with concurrent page fetching and batched persistence.
- Added simple load-more pagination.

### UI-1.4

- Added universal outcome ordering.
- Added leader outcome.
- Polished explorer cards.
- Polished event-detail associated-market rows with probability bars.
- Audited payload size and query behavior.

### UI-1.5B

- Fixed market-detail metric consistency.
- Added current-metadata fallback when snapshots are absent.
- Renamed generic change to `24H CHANGE`.
- Used Gamma `one_day_price_change` with snapshot fallback.
- Displayed child open interest as unavailable rather than fabricating values.

### UI-1.6

- Replaced runtime child aggregate ranking with stored event metrics.
- Preserved strict child visibility checks.
- Moved tag hydration behind selected-page ranking.
- Added short server cache and timing logs.

### UI-1.7

- Completed runtime profiling.
- Completed browser/render profiling.
- Completed lifecycle audit for completed sports artifacts.
- Completed market/event volume and liquidity distributions.
- Added timing-only diagnostics to explorer and category APIs.
- Did not implement lifecycle or threshold filters yet.

---

## 13. Current Explorer Ranking

Default explorer ordering now uses stored event aggregates:

```text
volume_24h DESC
volume DESC
liquidity DESC
open_interest DESC
updated_at DESC
```

Child-market joins should remain only for:

- Strict visibility confirmation with `EXISTS`.
- Hydration of selected event preview children.
- Event-detail associated-market rows.

Do not restore the earlier runtime weighted score or per-candidate child aggregation.

---

## 14. Data-Quality Fixes Completed

- Strict database reset and explorer cleanup.
- Gamma `/events` taxonomy ingestion.
- Event-first explorer grouping.
- Dynamic canonical categories backed by Gamma tags.
- Strict tradable child filtering.
- Stale and expired market removal.
- `enable_order_book` ingestion and filtering.
- `external_token_id` persistence.
- `clobTokenIds` persistence.
- Explicit YES/NO outcome extraction.
- Probability formatting:

```text
exact or near 1.0 -> >99%
exact or near 0.0 -> <1%
invalid -> n/a
```

- Market metric fallback from current metadata when snapshots do not exist.
- 24h probability delta from Gamma `one_day_price_change`, with snapshot fallback.
- Compact normalized metadata storage; no raw Gamma payload archive.

---

## 15. Performance Optimization History

### Ranking SQL

Before UI-1.6:

```text
Execution Time: 978.859 ms
Buffers: shared hit=99815
child aggregate loops=1568
markets_open_active_idx loops=10710
```

After ranking by stored event aggregates and hydrating tags only for selected events:

```text
Execution Time: 48.945 ms
Planning Time: 46.681 ms
Seq Scan on events: 1.658 ms for 1804 rows
tag hydration loops: 50
```

No additional ranking index was added because the remaining sequential event scan was negligible.

### Server cache

- In-memory API cache.
- TTL: `45,000 ms`.
- Cache key includes parsed query parameters.
- Errors are not cached.
- API Postgres idle timeout increased to `120 seconds` to exceed cache TTL.

### Earlier API benchmark

| Endpoint | Baseline | After UI-1.6 |
|---|---:|---:|
| `/api/events?limit=50` cached average | 1,864 ms | 138.9 ms external HTTP |
| `/api/categories` cached average | 597 ms | 55.8 ms external HTTP |
| Explorer payload | 60.7 KB | 60.6 KB |
| Event detail settled | 632-650 ms | 604-690 ms |

### UI-1.7 route timing breakdown

Explorer TTL refresh:

| Stage | Time |
|---|---:|
| Cache lookup | 0 ms |
| SQL client retrieval | 0.2 ms |
| Count query | 537 ms |
| Card page SQL and hydration | 4,022 ms |
| Transform | 11 ms |
| JSON stringify | 4 ms |
| Response creation | 2.5 ms |
| Route total | 4,039 ms |

Direct SQL averages:

| Query | Average |
|---|---:|
| Event count | 631 ms |
| Candidate top-50 ranking | 618 ms |
| Card page with child hydration | 2,735 ms |
| Hydration overhead above candidate query | about 2,118 ms |

### Connection measurements

| Measurement | Average |
|---|---:|
| Fresh Supabase connection plus `select 1` | 2,286 ms |
| Reused connection plus `select 1` | 293 ms |

### Browser measurements

Warm cached navigation:

| Stage | Measured range |
|---|---:|
| HTML response | 828-1,249 ms |
| Delay before events fetch | 2,664-3,302 ms |
| Events fetch | 73-142 ms |
| Categories fetch | about 166 ms |
| Render after events response | 1,134-1,264 ms |
| 50 cards interactive | 5,119-5,535 ms |

TTL-refresh browser navigation:

| Stage | Time |
|---|---:|
| HTML response | 236 ms |
| Delay before events fetch | 1,535 ms |
| Events fetch | 2,868 ms |
| Categories fetch | 694 ms |
| Render after events response | 977 ms |
| 50 cards interactive | 5,615 ms |

### Current bottleneck ranking

1. Explorer child hydration: about `2.74s` direct average.
2. Client hydration and delayed client-only fetch kickoff: `2.66-3.30s`.
3. Fresh Supabase connection startup: about `2.29s`.

JSON serialization is not material.

---

## 16. UI-1.7 Lifecycle Audit Findings

### Root cause

Completed sports rows can remain visible because Gamma may publish them as:

```text
active: true
closed: false
archived: false
acceptingOrders: true
enableOrderBook: true
future endDate
```

The current strict predicate therefore treats them as valid.

Live Gamma sample:

```text
title: Roland Garros ATP: Completed Match: Droguet/Gaston vs Halys/Herbert
active: true
closed: false
archived: false
acceptingOrders: true
enableOrderBook: true
endDate: 2026-06-08
outcomePrices: ["0.9995", "0.0005"]
umaResolutionStatus: "proposed"
sportsMarketType: "tennis_completed_match"
```

### Two sports-artifact shapes observed

1. Economically settled completed-match contracts:

```text
0.9995 / 0.0005
umaResolutionStatus: proposed
```

2. Scaffold-like completed-match rows:

```text
0.5 / 0.5
groupItemTitle: Completed Match
sportsMarketType identifies a completed-match contract
```

### Population

Audit snapshot:

```text
stored events: 2,568
stored markets: 16,427
default-feed events: 2,159
visible completed-match artifacts: 131
economically-settled completed-match artifacts: 19
```

Among `13,554` YES-priced visible markets:

| Probability bucket | Count |
|---|---:|
| YES >= 99% | 58 |
| YES 95-99% | 123 |
| YES 90-95% | 224 |
| YES 80-90% | 243 |
| YES <= 1% | 2,643 |
| YES 1-5% | 2,199 |

`2,701` markets, or `19.93%`, sit at `<=1%` or `>=99%`.

### Important conclusion

Do not globally hide markets solely because YES is near `0%` or `100%`. Many legitimate long-tail markets naturally sit at those extremes. The next fix should combine retained Gamma lifecycle metadata with a narrow sports completed-match rule.

---

## 17. Volume And Liquidity Audit

### Market-level distribution

| Metric | `<$100` | `$100-$1k` | `$1k-$10k` | `$10k-$100k` | `$100k+` |
|---|---:|---:|---:|---:|---:|
| Lifetime volume | 46.1% | 19.3% | 16.3% | 9.8% | 8.4% |
| 24h volume | 75.1% | 14.0% | 7.5% | 2.8% | 0.7% |
| Liquidity | 24.0% | 21.1% | 32.8% | 18.4% | 3.6% |

### Event-level distribution

| Metric | `<$100` | `$100-$1k` | `$1k-$10k` | `$10k-$100k` | `$100k+` |
|---|---:|---:|---:|---:|---:|
| Lifetime volume | 26.9% | 10.1% | 20.6% | 23.9% | 18.5% |
| 24h volume | 53.7% | 18.8% | 17.7% | 7.0% | 2.7% |
| Liquidity | 5.2% | 11.9% | 30.6% | 41.7% | 10.6% |

### Event-quality impact

| Hide events below | Hidden events | Lifetime volume lost |
|---|---:|---:|
| `$1k` | 951 | 0.0018% |
| `$5k` | 1,276 | 0.0144% |
| `$10k` | 1,480 | 0.0361% |
| `$50k` | 1,971 | 0.2051% |

### Recommended configurable threshold profiles

Proposed variables:

```env
MIN_MARKET_VOLUME=
MIN_MARKET_VOLUME_24H=
MIN_EVENT_VOLUME=
MIN_EVENT_VOLUME_24H=
MIN_MARKET_LIQUIDITY=
MIN_EVENT_LIQUIDITY=
```

| Profile | Market: volume / 24h / liquidity | Event: volume / 24h / liquidity | Events kept | Event volume kept |
|---|---|---:|---:|---:|
| Conservative | `$100 / $0 / $100` | `$1k / $0 / $100` | 1,607 | 99.9968% |
| Balanced | `$500 / $0 / $500` | `$5k / $0 / $500` | 1,273 | 99.9711% |
| Premium | `$1k / $100 / $1k` | `$10k / $100 / $1k` | 728 | 99.3349% |

Recommendation: introduce event-level thresholds first. Avoid hard child-market thresholds initially because they may hide useful low-probability outcomes inside meaningful event groups.

---

## 18. Known Bugs And Open Investigations

### 1. Completed sports-market artifacts

Examples:

```text
Roland Garros ATP / WTA cards showing "Completed Match"
Birmingham completed-match rows
```

Next investigation:

- Persist compact Gamma sports lifecycle metadata.
- Design a narrow completed-match exclusion.
- Preserve legitimate sports winner markets.
- Avoid global probability-based exclusion.

### 2. Explorer cache-refresh latency

Ranking SQL is no longer the main bottleneck. Remaining cost is mostly selected-event child hydration and remote database latency.

Next investigation:

- Split selected event IDs from preview hydration cleanly.
- Consider a compact SQL JSON preview aggregation or bounded second query.
- Keep payload compact.
- Do not add a summary table yet unless measurements justify it.

### 3. Client-side delayed fetch kickoff

The explorer is client-only:

```text
apps/web-v2/components/markets/markets-explorer-client.tsx
```

Initial requests wait for hydration and an additional `220 ms` debounce.

Next investigation:

- Server-prefetch initial categories and events.
- Pass initial payload into the client.
- Preserve client filtering, search, sort, and load-more behavior.
- Abort stale search requests.

### 4. Threshold policy

The audit strongly supports configurable event-level quality thresholds. Implement only after lifecycle correctness is addressed.

---

## 19. Recommended Next Steps

### Next implementation phase: UI-1.8 Lifecycle Correctness

1. Extend compact market lifecycle storage for useful Gamma fields:

```text
sports_market_type
game_start_time
uma_resolution_status
uma_resolution_statuses
resolved_by
ready
approved
```

2. Normalize and persist those fields without storing raw Gamma payloads.

3. Add narrow explorer exclusion logic for completed sports artifacts:

- Exclude `group_item_title = 'Completed Match'` when paired with completed-match sports type or equivalent Gamma lifecycle evidence.
- Consider `uma_resolution_status` and game timing.
- Do not hide ordinary sports winner markets.
- Do not globally exclude near-0% or near-100% markets.

4. Reingest or safely backfill explorer data.

5. Revalidate:

- Completed Roland Garros/Birmingham artifacts disappear.
- Legitimate active sports markets remain.
- Search, categories, pagination, ordering, event details, and market details remain intact.

### Then: UI-1.9 Explorer Fetch And Hydration Optimization

1. Server-prefetch initial explorer data.
2. Reduce selected-event preview hydration overhead.
3. Profile before introducing any persisted event-summary table.
4. Preserve cache behavior and data freshness.

### Then: UI-1.10 Configurable Explorer Quality Profiles

1. Add conservative event thresholds behind environment variables.
2. Measure feed quality and category coverage.
3. Consider balanced and premium modes only if product needs multiple browsing experiences.

---

## 20. Development Philosophy

- Measure before optimizing.
- Prefer small explainable changes.
- Preserve the explorer-first scope.
- Reuse Gamma metadata and normalized tables before inventing new storage.
- Keep storage bounded and cheap.
- Keep event cards event-first; do not regress to micro-market card spam.
- Keep child joins bounded.
- Avoid raw payload archives.
- Avoid giant aggregation systems and summary tables until profiling proves they are needed.
- Treat lifecycle correctness as a product-quality concern, not merely a ranking concern.
- Do not reintroduce Probis 1 intelligence features until explicitly scheduled.
- Run:

```bash
corepack pnpm typecheck
corepack pnpm lint
corepack pnpm build
```

after implementation changes.

---

## 21. Working Tree And Safety Notes

This repository may contain a broad dirty working tree from the Probis 2.0 reset and archive work. Do not revert unrelated changes. Read files carefully before editing.

Important preserved references:

```text
apps/web-legacy
legacy/probis1
packages/database/migrations-legacy
```

Do not execute destructive database resets automatically. The Supabase project is the intended database. Confirm the active `DATABASE_URL` before running migrations or reset helpers.

Current API timing instrumentation remains in:

```text
apps/api/app/api/events/route.ts
apps/api/app/api/categories/route.ts
```

It logs cache lookup, SQL-client retrieval, database duration, transformation, serialization where applicable, response creation, and total route timing.

---

## 22. Next Codex Chat Bootstrap Message

Paste the following message into the next Codex chat:

```text
We are continuing Probis 2.0 development.

First read:

D:\Aashish\Projects\Probis\Probis_2_0_Codex_Handover_June_2026.md

Treat that handover as the authoritative project context.

Important constraints:

- Probis 1 intelligence engine is archived in apps/web-legacy and legacy/probis1.
- Probis 2.0 is currently a UI-first Polymarket prediction-market explorer.
- Do NOT build signals, wallets, narratives, regimes, alerts, AI summaries, or new intelligence features yet.
- Gamma /events is the primary discovery source.
- Avoid broad standalone /markets ingestion unless a measured coverage gap justifies it.
- Preserve normalized compact storage and avoid raw Gamma payload archives.
- Preserve event-first explorer cards.
- Preserve the strict explorer-valid predicate:

  status = 'open'
  and active = true
  and closed = false
  and archived = false
  and accepting_orders = true
  and enable_order_book = true
  and end_date >= now()

- Preserve outcome ordering:
  - same resolution date: probability DESC
  - mixed resolution dates: resolution date ASC
- Preserve default event ranking:
  volume_24h DESC, volume DESC, liquidity DESC, open_interest DESC, updated_at DESC
- Do not revert unrelated dirty working-tree changes.
- Supabase is the intended database. Confirm DATABASE_URL before migrations or reset operations.

UI-1.7 audit is complete. The recommended next phase is UI-1.8 Lifecycle Correctness.

Primary bug:
Completed sports artifacts still appear in the event explorer because Gamma may expose rows such as "Completed Match" as active=true, closed=false, archived=false, acceptingOrders=true, enableOrderBook=true, and future-dated.

Live Gamma also exposes useful fields that Probis does not yet retain:

- sportsMarketType
- gameStartTime
- umaResolutionStatus
- umaResolutionStatuses
- resolvedBy
- ready
- approved

Implement a compact, production-quality lifecycle fix:

1. Inspect current normalization, repository, schema, migrations, and explorer predicate.
2. Add only the minimal lifecycle columns required.
3. Normalize and persist the useful Gamma lifecycle fields without raw payload storage.
4. Add a narrow completed-sports-artifact exclusion using groupItemTitle, sportsMarketType, game timing, and/or UMA status.
5. Do NOT globally hide markets solely because YES probability is <=1% or >=99%; many legitimate long-tail markets sit at those extremes.
6. Preserve legitimate active sports markets.
7. Keep event-first discovery and ranking unchanged except for lifecycle correctness.
8. Reingest or provide a safe backfill/reset flow.
9. Validate Roland Garros and Birmingham completed-match artifacts disappear while legitimate sports markets remain.
10. Run:
   corepack pnpm typecheck
   corepack pnpm lint
   corepack pnpm build

After implementation, summarize:

- files changed
- lifecycle fields added
- exact exclusion logic
- migration and reingestion steps
- validation results
- storage impact
- remaining limitations

Do not begin explorer hydration optimization or threshold filtering in the same phase unless a trivial dependency requires it.
```

