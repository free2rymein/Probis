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
