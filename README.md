# Probis

Probis is a production-grade institutional intelligence platform foundation for prediction market intelligence, wallet intelligence, anomaly detection, replay systems, alerting, AI summarization, and dashboards.

## Architecture

This repository is a pnpm/Turborepo monorepo.

- `apps/web`: Next.js 15 App Router frontend for institutional dashboards.
- `apps/api`: backend-only Next.js route-handler service.
- `apps/workers`: Python worker placeholder for future replay, ingestion, scoring, and alert jobs.
- `packages/ui`: shared UI primitives and data-dense components.
- `packages/database`: Supabase clients, database types, and environment helpers.
- `packages/shared`: constants, logger, utility functions, and formatters.
- `packages/intelligence`: anomaly enums, scoring helpers, and intelligence contracts.
- `packages/types`: shared domain and API response types.
- `infrastructure`: Docker, scripts, monitoring placeholders, and deployment support.

## Setup

Install pnpm, then install dependencies:

```bash
pnpm install
```

Create local environment files:

```bash
cp .env.example .env.local
cp .env.example apps/web/.env.local
cp .env.example apps/api/.env.local
```

Run development services:

```bash
pnpm dev
```

Run only the frontend or API:

```bash
pnpm dev:web
pnpm dev:api
```

## Commands

```bash
pnpm build
pnpm lint
pnpm typecheck
pnpm format
pnpm format:check
```

## Environment

Required variables are documented in `.env.example`.

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `DATABASE_URL`
- `REDIS_URL`
- `NEXT_PUBLIC_API_BASE_URL`
- `LOG_LEVEL`

Environment validation is intentionally centralized in app/package helpers so missing values fail early in production while development can use safe placeholders.

## Probis 2.0 Explorer Runtime

The recommended local API mode uses the prebuilt `explorer_event_cards` read
model with legacy query fallback:

```bash
EVENTS_QUERY_MODE=read-model-with-legacy-fallback pnpm dev:api
```

This mode is used by both `/api/events` and `/api/categories`. It preserves the
legacy dynamic query path as a runtime fallback if the read model is unavailable.

To force the older dynamic query path explicitly:

```bash
EVENTS_QUERY_MODE=legacy pnpm dev:api
```

If `explorer_event_cards` is empty or stale, refresh the full Probis 2.0 data
pipeline:

```bash
corepack pnpm --filter @probis/workers run pipeline:once
```

After a development explorer reset, run the same `pipeline:once` command to
rebuild staging, normalized explorer tables, and the read model.

## Development Workflow

Use shared packages for reusable contracts and utilities. Keep feature-specific behavior inside the owning app until it is used by multiple surfaces.

- Domain types live in `packages/types`.
- Data-access helpers live in `packages/database`.
- UI primitives live in `packages/ui`.
- Scoring and anomaly interfaces live in `packages/intelligence`.
- Cross-cutting constants and formatters live in `packages/shared`.

## Docker

Start the local service stack:

```bash
docker compose up --build
```

The compose file includes web, API, PostgreSQL, and Redis services. Workers are structured for VPS deployment and can be added as ingestion/replay jobs mature.
