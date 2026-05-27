import type { NormalizedMarket, NormalizedTrade } from "../types/events";
import type { PolymarketMarket, PolymarketTrade } from "../types/polymarket";

const normalizeStatus = (market: PolymarketMarket): NormalizedMarket["status"] => {
  if (market.closed) return "closed";
  if (market.active === false) return "paused";
  return "open";
};

export const normalizePolymarketMarket = (market: PolymarketMarket): NormalizedMarket | null => {
  const externalId = market.conditionId ?? market.id;
  const title = market.question ?? market.title;

  if (!externalId || !title) return null;

  return {
    source: "polymarket",
    externalId,
    slug: market.slug ?? externalId,
    title,
    description: market.description ?? null,
    category: market.category ?? "uncategorized",
    status: normalizeStatus(market),
    resolutionDate: market.endDate ? new Date(market.endDate) : null
  };
};

export const normalizePolymarketTrade = (
  trade: PolymarketTrade,
  marketId: string
): NormalizedTrade | null => {
  const externalMarketId = trade.conditionId ?? trade.marketId ?? trade.market;
  const walletAddress = trade.walletAddress ?? trade.makerAddress;
  const transactionHash = trade.transactionHash ?? trade.txHash ?? trade.id;
  const rawSide = trade.side?.toLowerCase();
  const price = trade.price?.toString();
  const quantity = (trade.size ?? trade.amount)?.toString();

  if (!externalMarketId || !walletAddress || !transactionHash || !rawSide || !price || !quantity) {
    return null;
  }

  const side = rawSide === "sell" ? "sell" : "buy";
  const tradeTimestamp =
    typeof trade.timestamp === "number"
      ? new Date(trade.timestamp > 10_000_000_000 ? trade.timestamp : trade.timestamp * 1000)
      : trade.timestamp
        ? new Date(trade.timestamp)
        : new Date();

  return {
    source: "polymarket",
    marketId,
    externalMarketId,
    walletAddress: walletAddress.toLowerCase(),
    side,
    price,
    quantity,
    usdValue: (Number(price) * Number(quantity)).toString(),
    transactionHash,
    tradeTimestamp
  };
};
