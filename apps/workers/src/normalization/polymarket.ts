import type { NormalizedMarket, NormalizedTrade } from "../types/events";
import type { PolymarketMarket, PolymarketTrade } from "../types/polymarket";

const normalizeStatus = (market: PolymarketMarket): NormalizedMarket["status"] => {
  if (market.closed) return "closed";
  if (market.active === false) return "paused";
  return "open";
};

const parseMaybeJsonArray = (value: unknown): unknown[] => {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string") return [];

  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const numberString = (value: unknown): string | null => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed.toString() : null;
};

const extractClobTokenIds = (market: PolymarketMarket): string[] => {
  const fromField = parseMaybeJsonArray(market.clobTokenIds).map(String).filter(Boolean);
  const fromTokens = (market.tokens ?? [])
    .map((token) => token.token_id ?? token.tokenId)
    .filter((tokenId): tokenId is string => Boolean(tokenId));

  return [...new Set([...fromField, ...fromTokens])];
};

const extractOutcomes = (market: PolymarketMarket): string[] =>
  parseMaybeJsonArray(market.outcomes).map(String).filter(Boolean);

const extractOutcomePrices = (market: PolymarketMarket): number[] =>
  parseMaybeJsonArray(market.outcomePrices)
    .map(Number)
    .filter((price) => Number.isFinite(price));

const extractCurrentProbability = (market: PolymarketMarket): string | null => {
  const direct =
    numberString(market.lastTradePrice) ??
    numberString(market.bestAsk) ??
    numberString(market.bestBid);
  if (direct) return direct;

  const prices = extractOutcomePrices(market);
  if (prices.length === 0) return null;

  const outcomes = extractOutcomes(market);
  const yesIndex = outcomes.findIndex((outcome) => outcome.toLowerCase() === "yes");
  return (prices[yesIndex >= 0 ? yesIndex : 0] ?? null)?.toString() ?? null;
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
    conditionId: market.conditionId ?? null,
    clobTokenIds: extractClobTokenIds(market),
    currentProbability: extractCurrentProbability(market),
    volume24h: numberString(market.volume24hrClob) ?? numberString(market.volume24hr),
    liquidity: numberString(market.liquidityNum) ?? numberString(market.liquidity),
    metadata: {
      polymarket_id: market.id ?? null,
      outcomes: extractOutcomes(market),
      outcome_prices: extractOutcomePrices(market),
      tags: market.tags ?? [],
      gamma_volume: numberString(market.volume),
      updated_at: market.updatedAt ?? null
    },
    resolutionDate: market.endDate ? new Date(market.endDate) : null
  };
};

export const normalizePolymarketTrade = (
  trade: PolymarketTrade,
  marketId: string
): NormalizedTrade | null => {
  const clobTokenId = trade.asset ?? trade.assetId ?? trade.tokenId ?? null;
  const externalMarketId = trade.conditionId ?? trade.marketId ?? trade.market ?? clobTokenId;
  const walletAddress =
    trade.proxyWallet ??
    trade.walletAddress ??
    trade.trader ??
    trade.takerAddress ??
    trade.makerAddress;
  const transactionHash =
    trade.transactionHash ?? trade.txHash ?? trade.tradeId ?? trade.id ?? trade.orderHash;
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
    usdValue: (trade.usdcSize ?? trade.notional ?? Number(price) * Number(quantity)).toString(),
    transactionHash,
    clobTokenId,
    outcome: trade.outcome ?? null,
    metadata: {
      raw_wallet_fields: {
        proxy_wallet: trade.proxyWallet ?? null,
        wallet_address: trade.walletAddress ?? null,
        trader: trade.trader ?? null,
        taker_address: trade.takerAddress ?? null,
        maker_address: trade.makerAddress ?? null
      },
      order_hash: trade.orderHash ?? null
    },
    tradeTimestamp
  };
};
