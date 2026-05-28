ALTER TYPE anomaly_type ADD VALUE IF NOT EXISTS 'repeat_whale_activity';
--> statement-breakpoint
ALTER TYPE anomaly_type ADD VALUE IF NOT EXISTS 'coordinated_wallet_activity';
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "wallet_profiles" (
  "wallet_address" text PRIMARY KEY NOT NULL,
  "first_seen_at" timestamptz NOT NULL,
  "last_seen_at" timestamptz NOT NULL,
  "total_volume_usd" numeric(30, 8) DEFAULT '0' NOT NULL,
  "total_trade_count" integer DEFAULT 0 NOT NULL,
  "smart_money_score" numeric(8, 4) DEFAULT '0' NOT NULL,
  "conviction_score" numeric(8, 4) DEFAULT '0' NOT NULL,
  "influence_score" numeric(8, 4) DEFAULT '0' NOT NULL,
  "active_market_count" integer DEFAULT 0 NOT NULL,
  "anomaly_trigger_count" integer DEFAULT 0 NOT NULL,
  "last_active_at" timestamptz NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "wallet_market_activity" (
  "wallet_address" text NOT NULL,
  "market_id" uuid NOT NULL REFERENCES "markets"("id") ON DELETE cascade,
  "total_volume_usd" numeric(30, 8) DEFAULT '0' NOT NULL,
  "trade_count" integer DEFAULT 0 NOT NULL,
  "net_position_estimate" numeric(30, 12) DEFAULT '0' NOT NULL,
  "last_trade_at" timestamptz NOT NULL,
  CONSTRAINT "wallet_market_activity_pk" PRIMARY KEY("wallet_address","market_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "wallet_daily_stats" (
  "wallet_address" text NOT NULL,
  "bucket_date" timestamptz NOT NULL,
  "total_volume_usd" numeric(30, 8) DEFAULT '0' NOT NULL,
  "trade_count" integer DEFAULT 0 NOT NULL,
  "active_markets" integer DEFAULT 0 NOT NULL,
  "anomaly_count" integer DEFAULT 0 NOT NULL,
  CONSTRAINT "wallet_daily_stats_pk" PRIMARY KEY("wallet_address","bucket_date")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "wallet_profiles_smart_money_score_desc_idx" ON "wallet_profiles" ("smart_money_score" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "wallet_profiles_influence_score_desc_idx" ON "wallet_profiles" ("influence_score" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "wallet_profiles_last_active_at_desc_idx" ON "wallet_profiles" ("last_active_at" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "wallet_profiles_total_volume_usd_desc_idx" ON "wallet_profiles" ("total_volume_usd" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "wallet_market_activity_wallet_idx" ON "wallet_market_activity" ("wallet_address");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "wallet_market_activity_market_idx" ON "wallet_market_activity" ("market_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "wallet_market_activity_last_trade_at_desc_idx" ON "wallet_market_activity" ("last_trade_at" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "wallet_market_activity_total_volume_usd_desc_idx" ON "wallet_market_activity" ("total_volume_usd" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "wallet_daily_stats_wallet_bucket_date_idx" ON "wallet_daily_stats" ("wallet_address","bucket_date");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "wallet_daily_stats_bucket_date_desc_idx" ON "wallet_daily_stats" ("bucket_date" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "wallet_daily_stats_total_volume_usd_desc_idx" ON "wallet_daily_stats" ("total_volume_usd" DESC);
