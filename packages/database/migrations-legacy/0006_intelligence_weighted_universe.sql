ALTER TABLE "markets" ADD COLUMN IF NOT EXISTS "universe_tier" text;

ALTER TABLE "markets" ADD COLUMN IF NOT EXISTS "intelligence_weighted_score" numeric(12, 6);

ALTER TABLE "markets" ADD COLUMN IF NOT EXISTS "repricing_velocity_score" numeric(12, 6);

ALTER TABLE "markets" ADD COLUMN IF NOT EXISTS "narrative_relevance_score" numeric(12, 6);

ALTER TABLE "markets" ADD COLUMN IF NOT EXISTS "wallet_activity_score" numeric(12, 6);

ALTER TABLE "markets" ADD COLUMN IF NOT EXISTS "exclusion_reason" text;

CREATE INDEX IF NOT EXISTS "markets_intelligence_weighted_score_desc_idx"
  ON "markets" ("intelligence_weighted_score" DESC);

CREATE INDEX IF NOT EXISTS "markets_universe_tier_idx" ON "markets" ("universe_tier");
