export type IntelligenceAnomalyType =
  | "probability_shock"
  | "volume_spike"
  | "activity_burst"
  | "whale_activity";

export type AnalysisMarket = {
  id: string;
  title: string;
};

export type AggregatePoint = {
  marketId: string;
  bucket: Date;
  close: number;
  volume: number;
  tradeCount: number;
};

export type LargeTrade = {
  id: string;
  marketId: string;
  walletAddress: string;
  side: "buy" | "sell";
  price: number;
  quantity: number;
  usdValue: number;
  transactionHash: string;
  tradeTimestamp: Date;
};

export type AnomalyCandidate = {
  anomalyType: IntelligenceAnomalyType;
  marketId: string;
  severityScore: number;
  confidenceScore: number;
  summary: string;
  walletAddresses: string[];
  metadata: Record<string, unknown>;
  detectedAt: Date;
};

export type DedupePolicy = Record<IntelligenceAnomalyType, number>;
