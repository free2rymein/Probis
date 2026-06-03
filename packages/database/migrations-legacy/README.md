# Migrations

`0001_initial_institutional_schema.sql` is the source-controlled baseline migration.

Migrations are applied with Drizzle's official `migrate()` flow from `drizzle-orm/postgres-js/migrator`.
Drizzle tracks applied files in `drizzle.__drizzle_migrations`; do not replay SQL files manually.

The Drizzle schema in `src/schema` mirrors this migration for type-safe queries. For future changes:

```bash
pnpm --filter @probis/database db:generate
pnpm --filter @probis/database db:migrate
```

Rerunning `db:migrate` is safe. Drizzle compares migration journal timestamps against its metadata table and skips migrations that have already been applied.

High-volume trade partition creation should be scheduled ahead of time:

```sql
select create_trade_partition_month('2026-06-01'::date);
```

Keep raw `trades` append-only. Build UI and analytics off `market_aggregates_1m`, `wallet_stats`, `anomaly_events`, and `market_timeline` whenever possible.
