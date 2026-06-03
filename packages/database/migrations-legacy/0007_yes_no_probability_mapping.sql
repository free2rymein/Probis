ALTER TABLE "markets" ADD COLUMN IF NOT EXISTS "current_probability_yes" numeric(18, 8);

ALTER TABLE "markets" ADD COLUMN IF NOT EXISTS "current_probability_no" numeric(18, 8);
