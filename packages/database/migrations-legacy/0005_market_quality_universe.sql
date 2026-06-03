ALTER TABLE "markets" ADD COLUMN IF NOT EXISTS "is_active_universe" boolean DEFAULT false NOT NULL;

ALTER TABLE "markets" ADD COLUMN IF NOT EXISTS "market_quality_score" numeric(12, 6);

ALTER TABLE "markets" ADD COLUMN IF NOT EXISTS "universe_rank" integer;

ALTER TABLE "markets" ADD COLUMN IF NOT EXISTS "last_selected_at" timestamptz;

CREATE INDEX IF NOT EXISTS "markets_is_active_universe_idx" ON "markets" ("is_active_universe");

CREATE INDEX IF NOT EXISTS "markets_market_quality_score_desc_idx"
  ON "markets" ("market_quality_score" DESC);

CREATE INDEX IF NOT EXISTS "markets_volume_24h_desc_idx" ON "markets" ("volume_24h" DESC);

CREATE INDEX IF NOT EXISTS "markets_liquidity_desc_idx" ON "markets" ("liquidity" DESC);
