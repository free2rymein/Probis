import type { NormalizedMarket, NormalizedTrade } from "../types/events";

export const createMockMarket = (): NormalizedMarket => ({
  source: "polymarket",
  externalId: "mock-condition-1",
  slug: "mock-market",
  title: "Mock market for local ingestion",
  description: "Local deterministic market used for worker development.",
  category: "development",
  status: "open",
  conditionId: "mock-condition-1",
  clobTokenIds: ["mock-token-yes"],
  currentProbability: "0.5",
  volume24h: null,
  liquidity: null,
  metadata: { mode: "mock" },
  resolutionDate: null
});

export const createMockTrade = (marketId: string): NormalizedTrade => {
  const price = (0.4 + Math.random() * 0.2).toFixed(4);
  const quantity = (10 + Math.random() * 100).toFixed(4);

  return {
    source: "polymarket",
    marketId,
    externalMarketId: "mock-condition-1",
    walletAddress: "0x0000000000000000000000000000000000000001",
    side: Math.random() > 0.5 ? "buy" : "sell",
    price,
    quantity,
    usdValue: (Number(price) * Number(quantity)).toFixed(4),
    transactionHash: `mock-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    clobTokenId: "mock-token-yes",
    outcome: "Yes",
    metadata: { mode: "mock" },
    tradeTimestamp: new Date()
  };
};
