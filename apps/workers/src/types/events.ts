export type MarketSource = "polymarket" | "kalshi" | "manifold" | "internal";

export type NormalizedMarket = {
  source: MarketSource;
  externalId: string;
  slug: string;
  title: string;
  description: string | null;
  category: string;
  status: "draft" | "open" | "paused" | "closed" | "settled" | "cancelled";
  conditionId: string | null;
  clobTokenIds: string[];
  currentProbability: string | null;
  volume24h: string | null;
  liquidity: string | null;
  metadata: Record<string, unknown>;
  resolutionDate: Date | null;
};

export type NormalizedTrade = {
  source: MarketSource;
  marketId: string;
  externalMarketId: string;
  walletAddress: string;
  side: "buy" | "sell";
  price: string;
  quantity: string;
  usdValue: string;
  transactionHash: string;
  clobTokenId: string | null;
  outcome: string | null;
  metadata: Record<string, unknown>;
  tradeTimestamp: Date;
};

export type ReplayEvent = {
  marketId: string;
  eventType:
    | "trade"
    | "aggregate"
    | "market_sync"
    | "live_trade_ingested"
    | "aggregate_updated"
    | "anomaly_detected"
    | "system";
  eventTimestamp: Date;
  payload: Record<string, unknown>;
};
