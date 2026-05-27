import { sql } from "drizzle-orm";
import { marketAggregates1m, type ProbisDatabase } from "@probis/database";
import type { CandleUpdate } from "../aggregation/candles";

export const createAggregatesRepository = (db: ProbisDatabase) => ({
  async upsertMany(candles: CandleUpdate[]) {
    if (candles.length === 0) return [];

    return db
      .insert(marketAggregates1m)
      .values(
        candles.map((candle) => ({
          marketId: candle.marketId,
          bucket: candle.bucket,
          open: candle.open,
          high: candle.high,
          low: candle.low,
          close: candle.close,
          volume: candle.volume,
          tradeCount: candle.tradeCount
        }))
      )
      .onConflictDoUpdate({
        target: [marketAggregates1m.marketId, marketAggregates1m.bucket],
        set: {
          high: sql`GREATEST(${marketAggregates1m.high}, excluded.high)`,
          low: sql`LEAST(${marketAggregates1m.low}, excluded.low)`,
          close: sql`excluded.close`,
          volume: sql`${marketAggregates1m.volume} + excluded.volume`,
          tradeCount: sql`${marketAggregates1m.tradeCount} + excluded.trade_count`
        }
      })
      .returning();
  }
});
