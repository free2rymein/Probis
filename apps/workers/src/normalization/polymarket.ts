import type { NormalizedMarket, NormalizedTrade } from "../types/events";
import type { PolymarketMarket, PolymarketTrade } from "../types/polymarket";
import { createHash } from "node:crypto";
import { logger } from "../utils/logger";
import { serializeForHash } from "../utils/serialization";

const normalizeStatus = (market: PolymarketMarket): NormalizedMarket["status"] => {
  if (market.resolved) return "settled";
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
  return Number.isFinite(parsed) && parsed >= 0 ? parsed.toString() : null;
};

const firstNumberString = (...values: unknown[]) => {
  for (const value of values) {
    const parsed = numberString(value);
    if (parsed !== null) return parsed;
  }

  return null;
};

const extractClobTokenIds = (market: PolymarketMarket): string[] => {
  const fromField = parseMaybeJsonArray(market.clobTokenIds).map(String).filter(Boolean);
  const fromTokens = (market.tokens ?? [])
    .map((token) => token.token_id ?? token.tokenId)
    .filter((tokenId): tokenId is string => Boolean(tokenId));

  return [...new Set([...fromField, ...fromTokens])];
};

const outcomeLabel = (value: unknown) => {
  if (typeof value === "string") return value;
  if (typeof value !== "object" || value === null) return null;

  const record = value as Record<string, unknown>;
  const label = record.name ?? record.label ?? record.outcome ?? record.title;
  return typeof label === "string" ? label : null;
};

const extractOutcomes = (market: PolymarketMarket): string[] =>
  parseMaybeJsonArray(market.outcomes)
    .map(outcomeLabel)
    .filter((outcome): outcome is string => Boolean(outcome));

const extractOutcomePrices = (market: PolymarketMarket): number[] =>
  parseMaybeJsonArray(market.outcomePrices)
    .map(Number)
    .filter((price) => Number.isFinite(price));

const normalizeTags = (tags: PolymarketMarket["tags"]): string[] =>
  (tags ?? [])
    .map((tag) => {
      if (typeof tag === "string") return tag;
      return tag.label ?? tag.name ?? tag.slug ?? null;
    })
    .filter((tag): tag is string => Boolean(tag));

const CATEGORY_KEYWORDS = {
  crypto: ["crypto", "bitcoin", "btc", "ethereum", "eth", "solana", "sol", "xrp", "token"],
  geopolitics: [
    "iran",
    "israel",
    "gaza",
    "ukraine",
    "russia",
    "china",
    "taiwan",
    "sanction",
    "war"
  ],
  elections: ["election", "president", "senate", "congress", "trump", "biden", "polling"],
  politics: ["politics", "government", "supreme court", "approval"],
  finance_macro: ["fed", "inflation", "cpi", "recession", "economy", "gdp", "tariff"],
  rates: ["rates", "rate cut", "fomc", "treasury", "yield"],
  commodities: ["oil", "gold", "natural gas", "wti", "brent", "copper"],
  technology_ai: ["ai", "openai", "nvidia", "apple", "tesla", "spacex", "google", "microsoft"],
  regulation: ["regulation", "sec", "lawsuit", "ban", "approval", "etf"],
  weather: ["weather", "hurricane", "temperature", "rain", "snow", "storm"],
  sports: [
    "sports",
    "nba",
    "nfl",
    "mlb",
    "nhl",
    "soccer",
    "football",
    "uefa",
    "champions league",
    "premier league",
    "la liga",
    "fifa",
    "world cup",
    "tennis",
    "ufc",
    "golf"
  ],
  esports: ["esports", "e-sports", "lol", "league of legends", "valorant", "cs2", "dota"],
  entertainment: ["movie", "oscars", "grammy", "music", "celebrity", "tv", "box office"]
} as const;

const normalizeCategory = (market: PolymarketMarket, title: string, tags: string[]) => {
  const rawCategory = market.category?.trim().toLowerCase();
  const text = [
    rawCategory,
    title,
    market.description,
    market.slug,
    market.subtitle,
    market.rules,
    market.resolutionSource,
    market.marketGroup,
    market.groupItemTitle,
    market.eventTitle,
    market.seriesTitle,
    ...tags
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some((keyword) => text.includes(keyword))) return category;
  }

  return rawCategory && rawCategory !== "uncategorized" ? rawCategory : "other";
};

const extractResolutionDate = (market: PolymarketMarket) => {
  const raw =
    market.endDate ??
    market.endDateIso ??
    market.resolutionDate ??
    market.closeTime ??
    market.closedTime ??
    null;
  if (!raw) return null;

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const normalizeProbabilityValue = (value: unknown) => {
  const parsed = numberString(value);
  if (parsed === null) return null;

  const probability = Number(parsed);
  return probability >= 0 && probability <= 1 ? parsed : null;
};

const tokenOutcomeLabel = (token: NonNullable<PolymarketMarket["tokens"]>[number]) =>
  token.outcome ?? token.name ?? token.label;

const extractYesNoProbabilities = (
  market: PolymarketMarket,
  title: string
): {
  yes: string | null;
  no: string | null;
  outcomes: string[];
  outcomePrices: number[];
} => {
  const prices = extractOutcomePrices(market);
  const outcomes = extractOutcomes(market);
  const yesIndex = outcomes.findIndex((outcome) => outcome.trim().toLowerCase() === "yes");
  const noIndex = outcomes.findIndex((outcome) => outcome.trim().toLowerCase() === "no");

  let yes = yesIndex >= 0 ? normalizeProbabilityValue(prices[yesIndex]) : null;
  let no = noIndex >= 0 ? normalizeProbabilityValue(prices[noIndex]) : null;

  if (yes === null || no === null) {
    for (const token of market.tokens ?? []) {
      const label = tokenOutcomeLabel(token)?.trim().toLowerCase();
      if (label === "yes" && yes === null) yes = normalizeProbabilityValue(token.price);
      if (label === "no" && no === null) no = normalizeProbabilityValue(token.price);
    }
  }

  if (yes === null) {
    logger.warn("market_probability_mapping.failed", {
      title,
      rawOutcomes: JSON.stringify(market.outcomes ?? null),
      rawOutcomePrices: JSON.stringify(market.outcomePrices ?? null),
      mappedYesProbability: null
    });
  } else {
    logger.info("market_probability_mapping.success", {
      title,
      rawOutcomes: JSON.stringify(market.outcomes ?? null),
      rawOutcomePrices: JSON.stringify(market.outcomePrices ?? null),
      mappedYesProbability: Number(yes)
    });
  }

  return { yes, no, outcomes, outcomePrices: prices };
};

export const normalizePolymarketMarket = (market: PolymarketMarket): NormalizedMarket | null => {
  const externalId = market.conditionId ?? market.id;
  const title = market.question ?? market.title;

  if (!externalId || !title) return null;

  const tags = normalizeTags(market.tags);
  const probabilityMapping = extractYesNoProbabilities(market, title);
  const volume24h = firstNumberString(
    market.volume24hrClob,
    market.volume24hr,
    market.volume24h,
    market.volume24H
  );
  const totalVolume = firstNumberString(market.volumeNum, market.volume);
  const liquidity = firstNumberString(market.liquidityNum, market.liquidityClob, market.liquidity);
  const endDate = extractResolutionDate(market);

  return {
    source: "polymarket",
    externalId,
    slug: market.slug ?? externalId,
    title,
    description: market.description ?? null,
    category: normalizeCategory(market, title, tags),
    status: normalizeStatus(market),
    conditionId: market.conditionId ?? null,
    clobTokenIds: extractClobTokenIds(market),
    currentProbability: probabilityMapping.yes,
    currentProbabilityYes: probabilityMapping.yes,
    currentProbabilityNo: probabilityMapping.no,
    volume24h,
    liquidity,
    metadata: {
      polymarket_id: market.id ?? null,
      outcomes: probabilityMapping.outcomes,
      outcome_prices: probabilityMapping.outcomePrices,
      current_probability_yes: probabilityMapping.yes,
      current_probability_no: probabilityMapping.no,
      tags,
      raw_category: market.category ?? null,
      subtitle: market.subtitle ?? null,
      rules: market.rules ?? null,
      resolution_source: market.resolutionSource ?? null,
      market_group: market.marketGroup ?? null,
      group_item_title: market.groupItemTitle ?? null,
      event_title: market.eventTitle ?? null,
      series_title: market.seriesTitle ?? null,
      gamma_volume: totalVolume,
      gamma_volume_24h: volume24h,
      gamma_liquidity: liquidity,
      updated_at: market.updatedAt ?? null,
      end_date: endDate?.toISOString() ?? null,
      active: market.active ?? null,
      closed: market.closed ?? null,
      resolved: market.resolved ?? null,
      archived: market.archived ?? null
    },
    resolutionDate: endDate
  };
};

export const normalizePolymarketTrade = (
  trade: PolymarketTrade,
  marketId: string
): NormalizedTrade | null => {
  const clobTokenId = trade.asset ?? trade.assetId ?? trade.tokenId ?? trade.token_id ?? null;
  const externalMarketId =
    trade.conditionId ??
    trade.condition_id ??
    trade.marketId ??
    trade.market_id ??
    trade.market ??
    clobTokenId;
  const walletAddress =
    trade.proxyWallet ??
    trade.proxy_wallet ??
    trade.walletAddress ??
    trade.wallet ??
    trade.trader ??
    trade.takerAddress ??
    trade.taker ??
    trade.maker ??
    trade.makerAddress;
  const rawSide = trade.side?.toLowerCase();
  const price = trade.price?.toString();
  const quantity = (trade.size ?? trade.amount ?? trade.shares)?.toString();

  if (!externalMarketId || !walletAddress || !rawSide || !price || !quantity) {
    return null;
  }

  const side = rawSide === "sell" ? "sell" : "buy";
  const tradeTimestamp =
    typeof trade.timestamp === "number"
      ? new Date(trade.timestamp > 10_000_000_000 ? trade.timestamp : trade.timestamp * 1000)
      : trade.timestamp
        ? new Date(trade.timestamp)
        : new Date();
  const transactionHash =
    trade.transactionHash ??
    trade.transaction_hash ??
    trade.txHash ??
    trade.tradeId ??
    trade.trade_id ??
    trade.id ??
    trade.orderHash ??
    createHash("sha256")
      .update(
        [
          externalMarketId,
          clobTokenId ?? "",
          walletAddress,
          side,
          tradeTimestamp.toISOString(),
          price,
          quantity
        ]
          .map(serializeForHash)
          .join("|")
      )
      .digest("hex");

  return {
    source: "polymarket",
    marketId,
    externalMarketId,
    walletAddress: walletAddress.toLowerCase(),
    side,
    price,
    quantity,
    usdValue: (
      trade.usdcSize ??
      trade.usdc_size ??
      trade.notional ??
      Number(price) * Number(quantity)
    ).toString(),
    transactionHash: serializeForHash(transactionHash),
    clobTokenId,
    outcome: trade.outcome ?? null,
    metadata: {
      raw_wallet_fields: {
        proxy_wallet: trade.proxyWallet ?? null,
        proxy_wallet_snake: trade.proxy_wallet ?? null,
        wallet_address: trade.walletAddress ?? null,
        wallet: trade.wallet ?? null,
        trader: trade.trader ?? null,
        taker_address: trade.takerAddress ?? null,
        taker: trade.taker ?? null,
        maker: trade.maker ?? null,
        maker_address: trade.makerAddress ?? null
      },
      order_hash: trade.orderHash ?? null
    },
    tradeTimestamp
  };
};
