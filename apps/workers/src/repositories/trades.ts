import { inArray } from "drizzle-orm";
import { trades, type ProbisDatabase } from "@probis/database";
import type { NormalizedTrade } from "../types/events";
import { serializeJson } from "../utils/serialization";

export const createTradesRepository = (db: ProbisDatabase) => ({
  async existingTransactionHashes(hashes: string[]) {
    if (hashes.length === 0) return new Set<string>();

    const rows = await db
      .select({ transactionHash: trades.transactionHash })
      .from(trades)
      .where(inArray(trades.transactionHash, hashes));

    return new Set(rows.map((row) => row.transactionHash));
  },

  async appendMany(items: NormalizedTrade[]) {
    if (items.length === 0) return [];

    const hashes = [...new Set(items.map((item) => item.transactionHash))];
    const existing = await this.existingTransactionHashes(hashes);
    const unique = items.filter((item) => !existing.has(item.transactionHash));

    if (unique.length === 0) return [];

    return db
      .insert(trades)
      .values(
        unique.map((item) => ({
          marketId: item.marketId,
          walletAddress: item.walletAddress,
          side: item.side,
          price: item.price,
          quantity: item.quantity,
          usdValue: item.usdValue,
          transactionHash: item.transactionHash,
          clobTokenId: item.clobTokenId,
          outcome: item.outcome,
          metadata: serializeJson(item.metadata),
          tradeTimestamp: item.tradeTimestamp
        }))
      )
      .returning();
  }
});
