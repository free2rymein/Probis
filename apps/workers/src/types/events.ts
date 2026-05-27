export type MarketSource = "polymarket" | "kalshi" | "manifold" | "internal";

export type NormalizedMarket = {
  source: MarketSource;
  externalId: string;
  slug: string;
  title: string;
  description: string | null;
  category: string;
  status: "draft" | "open" | "paused" | "closed" | "settled" | "cancelled";
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
  tradeTimestamp: Date;
};

export type ReplayEvent = {
  marketId: string;
  eventType: "trade" | "aggregate" | "system";
  eventTimestamp: Date;
  payload: Record<string, unknown>;
};
