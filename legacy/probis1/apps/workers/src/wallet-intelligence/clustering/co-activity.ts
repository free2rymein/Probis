import type { CoordinatedActivityCandidate } from "../types";

export type ClusterPrimitive = {
  marketId: string;
  relationshipStrength: number;
  walletAddresses: string[];
  metadata: Record<string, unknown>;
};

export const buildCoActivityPrimitives = (
  candidates: CoordinatedActivityCandidate[]
): ClusterPrimitive[] =>
  candidates.map((candidate) => ({
    marketId: candidate.marketId,
    walletAddresses: candidate.walletAddresses,
    relationshipStrength: Math.min(
      100,
      candidate.walletAddresses.length * 12 + candidate.tradeCount * 2
    ),
    metadata: {
      primitive: "same_market_timing_proximity",
      trade_count: candidate.tradeCount,
      total_volume_usd: candidate.totalVolumeUsd,
      started_at: candidate.startedAt.toISOString(),
      ended_at: candidate.endedAt.toISOString()
    }
  }));
