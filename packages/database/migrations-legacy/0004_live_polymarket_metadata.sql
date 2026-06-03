ALTER TYPE timeline_event_type ADD VALUE IF NOT EXISTS 'market_sync';
--> statement-breakpoint
ALTER TYPE timeline_event_type ADD VALUE IF NOT EXISTS 'live_trade_ingested';
--> statement-breakpoint
ALTER TYPE timeline_event_type ADD VALUE IF NOT EXISTS 'aggregate_updated';
--> statement-breakpoint
ALTER TYPE timeline_event_type ADD VALUE IF NOT EXISTS 'anomaly_detected';
--> statement-breakpoint
ALTER TABLE "markets" ADD COLUMN IF NOT EXISTS "condition_id" text;
--> statement-breakpoint
ALTER TABLE "markets" ADD COLUMN IF NOT EXISTS "clob_token_ids" text[] DEFAULT ARRAY[]::text[] NOT NULL;
--> statement-breakpoint
ALTER TABLE "markets" ADD COLUMN IF NOT EXISTS "current_probability" numeric(18, 8);
--> statement-breakpoint
ALTER TABLE "markets" ADD COLUMN IF NOT EXISTS "volume_24h" numeric(30, 8);
--> statement-breakpoint
ALTER TABLE "markets" ADD COLUMN IF NOT EXISTS "liquidity" numeric(30, 8);
--> statement-breakpoint
ALTER TABLE "markets" ADD COLUMN IF NOT EXISTS "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "trades" ADD COLUMN IF NOT EXISTS "clob_token_id" text;
--> statement-breakpoint
ALTER TABLE "trades" ADD COLUMN IF NOT EXISTS "outcome" text;
--> statement-breakpoint
ALTER TABLE "trades" ADD COLUMN IF NOT EXISTS "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "markets_condition_id_idx" ON "markets" ("condition_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "markets_clob_token_ids_gin_idx" ON "markets" USING gin ("clob_token_ids");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "trades_clob_token_id_idx" ON "trades" ("clob_token_id");
