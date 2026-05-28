import { and, desc, eq, gte, sql } from "drizzle-orm";
import {
  anomalyEvents,
  marketAggregates1m,
  markets,
  trades,
  type ProbisDatabase
} from "@probis/database";
import type {
  AggregatePoint,
  AnalysisMarket,
  AnomalyCandidate,
  IntelligenceAnomalyType,
  LargeTrade
} from "../types";
import { serializeJson } from "../../utils/serialization";

const toNumber = (value: string | number | null): number => Number(value ?? 0);

export const createIntelligenceRepository = (db: ProbisDatabase) => ({
  async getActiveMarketsForAnalysis(limit: number): Promise<AnalysisMarket[]> {
    return db
      .select({
        id: markets.id,
        title: markets.title
      })
      .from(markets)
      .where(eq(markets.status, "open"))
      .orderBy(desc(markets.updatedAt))
      .limit(limit);
  },

  async getRecentAggregates(marketId: string, since: Date, limit = 90): Promise<AggregatePoint[]> {
    const rows = await db
      .select({
        marketId: marketAggregates1m.marketId,
        bucket: marketAggregates1m.bucket,
        close: marketAggregates1m.close,
        volume: marketAggregates1m.volume,
        tradeCount: marketAggregates1m.tradeCount
      })
      .from(marketAggregates1m)
      .where(and(eq(marketAggregates1m.marketId, marketId), gte(marketAggregates1m.bucket, since)))
      .orderBy(desc(marketAggregates1m.bucket))
      .limit(limit);

    return rows.map((row) => ({
      marketId: row.marketId,
      bucket: row.bucket,
      close: toNumber(row.close),
      volume: toNumber(row.volume),
      tradeCount: row.tradeCount
    }));
  },

  async findRecentDuplicate(marketId: string, anomalyType: IntelligenceAnomalyType, since: Date) {
    const [row] = await db
      .select({ id: anomalyEvents.id })
      .from(anomalyEvents)
      .where(
        and(
          eq(anomalyEvents.marketId, marketId),
          eq(anomalyEvents.anomalyType, anomalyType),
          gte(anomalyEvents.createdAt, since)
        )
      )
      .limit(1);

    return row ?? null;
  },

  async insertAnomalyEvent(candidate: AnomalyCandidate) {
    const [row] = await db
      .insert(anomalyEvents)
      .values({
        marketId: candidate.marketId,
        anomalyType: candidate.anomalyType,
        severityScore: String(candidate.severityScore),
        confidenceScore: String(candidate.confidenceScore),
        summary: candidate.summary,
        walletAddresses: candidate.walletAddresses,
        metadata: serializeJson(candidate.metadata),
        detectedAt: candidate.detectedAt
      })
      .returning({ id: anomalyEvents.id });

    return row;
  },

  async getRecentLargeTrades(
    since: Date,
    usdThreshold: number,
    limit: number
  ): Promise<LargeTrade[]> {
    const rows = await db
      .select({
        id: trades.id,
        marketId: trades.marketId,
        walletAddress: trades.walletAddress,
        side: trades.side,
        price: trades.price,
        quantity: trades.quantity,
        usdValue: trades.usdValue,
        transactionHash: trades.transactionHash,
        tradeTimestamp: trades.tradeTimestamp
      })
      .from(trades)
      .where(
        and(gte(trades.tradeTimestamp, since), sql`${trades.usdValue}::numeric >= ${usdThreshold}`)
      )
      .orderBy(desc(trades.tradeTimestamp))
      .limit(limit);

    return rows.map((row) => ({
      id: row.id,
      marketId: row.marketId,
      walletAddress: row.walletAddress,
      side: row.side,
      price: toNumber(row.price),
      quantity: toNumber(row.quantity),
      usdValue: toNumber(row.usdValue),
      transactionHash: row.transactionHash,
      tradeTimestamp: row.tradeTimestamp
    }));
  }
});

export type IntelligenceRepository = ReturnType<typeof createIntelligenceRepository>;
