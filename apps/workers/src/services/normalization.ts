import type { GammaEvent, GammaMarket, GammaTag } from "./polymarket";

export const numberOrNull = (value: unknown) => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export const stringArray = (value: string | string[] | Array<string | number> | undefined) => {
  if (Array.isArray(value)) return value.map(String);
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
};

export const slugify = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "other";

export const dateOrNull = (value: string | undefined) => {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const endDate = (market: GammaMarket) =>
  dateOrNull(market.endDateIso ?? market.endDate ?? market.resolutionDate);

const status = (market: GammaMarket) => {
  if (market.archived) return "archived";
  if (market.resolved) return "resolved";
  if (market.closed) return "closed";
  return market.active === false ? "paused" : "open";
};

export const marketFinalExclusionReason = (market: GammaMarket): ExclusionReason | null => {
  if (market.closed === true) return "market_closed";
  if (market.active === false) return "market_inactive";
  if (market.archived === true) return "market_archived";
  if (market.resolved === true || market.umaResolutionStatus?.toLowerCase() === "resolved") return "market_resolved";
  if (market.acceptingOrders === false) return "not_accepting_orders";
  if (market.automaticallyResolved === true) return "market_automatically_resolved";
  if (market.closedTime) return "market_closed_time_present";
  if (market.period?.trim().toLowerCase() === "ft") return "completed_sports_period_ft";
  if (market.finishedTimestamp) return "completed_finished_timestamp";
  return null;
};

export const hasFinalMarketState = (market: GammaMarket) => marketFinalExclusionReason(market) !== null;

export const eventFinalExclusionReason = (event: GammaEvent): ExclusionReason | null => {
  if (event.closed === true || event.ended === true) return "event_closed";
  if (event.active === false) return "event_inactive";
  if (event.archived === true) return "event_archived";
  if (event.automaticallyResolved === true) return "event_automatically_resolved";
  if (event.closedTime) return "event_closed_time_present";
  if (event.period?.trim().toLowerCase() === "ft") return "completed_sports_period_ft";
  if (event.finishedTimestamp) return "completed_finished_timestamp";
  return null;
};

export const hasFinalEventState = (event: GammaEvent) => eventFinalExclusionReason(event) !== null;

export const canonicalCategories = [
  "Politics",
  "Geopolitics",
  "Macro",
  "Crypto",
  "Technology",
  "Sports",
  "Culture",
  "Science",
  "Weather",
  "Other"
] as const;

type CanonicalCategory = (typeof canonicalCategories)[number];

const categoryRules: Array<{ category: CanonicalCategory; keywords: string[] }> = [
  {
    category: "Sports",
    keywords: [
      "esports",
      "sports",
      "nba",
      "nfl",
      "mlb",
      "nhl",
      "soccer",
      "football",
      "ufc",
      "tennis",
      "baseball",
      "basketball",
      "hockey",
      "golf",
      "cricket",
      "formula-1",
      "f1"
    ]
  },
  {
    category: "Geopolitics",
    keywords: [
      "geopolitics",
      "iran",
      "war",
      "conflict",
      "russia",
      "ukraine",
      "israel",
      "china",
      "taiwan"
    ]
  },
  {
    category: "Politics",
    keywords: ["politics", "elections", "election", "president", "senate", "house", "congress"]
  },
  {
    category: "Crypto",
    keywords: ["crypto", "crypto-prices", "bitcoin", "ethereum", "solana"]
  },
  {
    category: "Macro",
    keywords: [
      "economy",
      "fed-rates",
      "inflation",
      "recession",
      "macro",
      "interest-rates",
      "interest rate",
      "finance",
      "stocks",
      "fed"
    ]
  },
  {
    category: "Technology",
    keywords: ["ai", "tech", "technology", "openai", "nvidia", "tesla", "spacex", "big-tech"]
  },
  {
    category: "Weather",
    keywords: ["weather", "hurricane", "temperature", "climate", "climate-science"]
  },
  {
    category: "Culture",
    keywords: [
      "oscars",
      "oscar",
      "music",
      "movies",
      "movie",
      "culture",
      "pop-culture",
      "entertainment",
      "celebrity"
    ]
  },
  {
    category: "Science",
    keywords: ["science", "space", "medicine"]
  }
];

export type NormalizedTag = {
  externalTagId: string | null;
  slug: string;
  label: string;
  rawType: string | null;
};

export type NormalizedOutcome = {
  name: string;
  externalTokenId: string | null;
  probability: number | null;
  volume: number;
  rank: number;
};

export type NormalizedMarket = {
  externalMarketId: string;
  slug: string;
  title: string;
  description: string | null;
  groupItemTitle: string | null;
  sportsMarketType: string | null;
  gameStartTime: Date | null;
  umaResolutionStatus: string | null;
  umaResolutionStatuses: string[];
  resolvedBy: string | null;
  ready: boolean | null;
  approved: boolean | null;
  resolved: boolean | null;
  period: string | null;
  finishedTimestamp: Date | null;
  automaticallyResolved: boolean | null;
  categorySlug: string;
  categoryName: CanonicalCategory;
  categorySource: "event_tags" | "market_fallback";
  categoryConfidence: number;
  status: string;
  endDate: Date | null;
  active: boolean | null;
  closed: boolean | null;
  archived: boolean | null;
  acceptingOrders: boolean | null;
  enableOrderBook: boolean | null;
  closedTime: Date | null;
  volume: number | null;
  volume24h: number | null;
  liquidity: number | null;
  featured: boolean | null;
  isNew: boolean | null;
  competitive: number | null;
  oneDayPriceChange: number | null;
  oneHourPriceChange: number | null;
  oneWeekPriceChange: number | null;
  gammaUpdatedAt: Date | null;
  tags: NormalizedTag[];
  outcomes: NormalizedOutcome[];
  snapshot: {
    probability: number | null;
    volume: number | null;
    liquidity: number | null;
    openInterest: number | null;
  };
};

export type NormalizedEvent = {
  externalEventId: string;
  slug: string;
  title: string;
  description: string | null;
  startDate: Date | null;
  endDate: Date | null;
  categorySlug: string;
  categoryName: CanonicalCategory;
  active: boolean;
  closed: boolean;
  archived: boolean;
  volume: number | null;
  volume24h: number | null;
  liquidity: number | null;
  openInterest: number | null;
  closedTime: Date | null;
  live: boolean | null;
  ended: boolean | null;
  period: string | null;
  finishedTimestamp: Date | null;
  score: string | null;
  automaticallyResolved: boolean | null;
  gammaUpdatedAt: Date | null;
  tags: NormalizedTag[];
  markets: NormalizedMarket[];
};

export const exclusionReasons = [
  "event_inactive",
  "event_closed",
  "event_archived",
  "event_automatically_resolved",
  "event_closed_time_present",
  "market_inactive",
  "market_closed",
  "market_resolved",
  "market_archived",
  "not_accepting_orders",
  "market_automatically_resolved",
  "market_closed_time_present",
  "completed_sports_period_ft",
  "completed_finished_timestamp",
  "invalid_outcomes",
  "invalid_prices",
  "expired_date_only",
  "unknown"
] as const;

export type ExclusionReason = (typeof exclusionReasons)[number];
export type ExclusionCounts = Record<ExclusionReason, number>;

export const createExclusionCounts = (): ExclusionCounts =>
  Object.fromEntries(exclusionReasons.map((reason) => [reason, 0])) as ExclusionCounts;

const bump = (counts: ExclusionCounts | undefined, reason: ExclusionReason) => {
  if (counts) counts[reason] += 1;
};

const normalizeTag = (tag: string | GammaTag): NormalizedTag | null => {
  const label = typeof tag === "string" ? tag : tag.label ?? tag.name ?? tag.slug;
  if (!label) return null;
  return {
    externalTagId: typeof tag === "string" || tag.id === undefined ? null : String(tag.id),
    slug: typeof tag === "string" ? slugify(tag) : tag.slug ?? slugify(label),
    label,
    rawType: typeof tag === "string" ? null : tag.type ?? null
  };
};

const normalizeTags = (tags: Array<string | GammaTag> | undefined) =>
  [...new Map((tags ?? []).map(normalizeTag).filter((tag) => tag !== null).map((tag) => [tag.slug, tag])).values()];

const matches = (value: string, keyword: string) => {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i").test(value);
};

const classify = (market: GammaMarket, tags: NormalizedTag[]) => {
  const tagText = tags.flatMap((tag) => [tag.slug, tag.label]).join(" ");
  const marketText = [market.category, market.question, market.title, market.description]
    .filter(Boolean)
    .join(" ");

  for (const rule of categoryRules) {
    if (rule.keywords.some((keyword) => matches(tagText, keyword))) {
      return { name: rule.category, confidence: 1 };
    }
  }

  for (const rule of categoryRules) {
    if (rule.keywords.some((keyword) => matches(marketText, keyword))) {
      return { name: rule.category, confidence: 0.7 };
    }
  }

  return { name: "Other" as const, confidence: 0.4 };
};

export const normalizeMarket = (
  market: GammaMarket,
  inheritedTags: NormalizedTag[] = [],
  categorySource: NormalizedMarket["categorySource"] = "market_fallback",
  exclusionCounts?: ExclusionCounts
): NormalizedMarket | null => {
  const finalReason = marketFinalExclusionReason(market);
  if (finalReason) {
    bump(exclusionCounts, finalReason);
    return null;
  }
  if (market.active !== true || market.closed !== false || market.archived !== false) {
    bump(exclusionCounts, "market_inactive");
    return null;
  }
  if (market.acceptingOrders !== true || market.enableOrderBook !== true) {
    bump(exclusionCounts, "market_inactive");
    return null;
  }
  const externalMarketId = market.conditionId ?? market.id;
  const title = market.question ?? market.title;
  if (!externalMarketId || !title) {
    bump(exclusionCounts, "unknown");
    return null;
  }

  const labels = stringArray(market.outcomes);
  const prices = stringArray(market.outcomePrices);
  const tokenIds = stringArray(market.clobTokenIds);
  const tokenLabels = market.tokens?.map((token) => token.outcome ?? token.name ?? token.label ?? "");
  const outcomeLabels = labels.length > 0 ? labels : tokenLabels ?? [];
  if (outcomeLabels.length === 0 || outcomeLabels.every((label) => label.trim().length === 0)) {
    bump(exclusionCounts, "invalid_outcomes");
    return null;
  }
  const normalizedPrices = outcomeLabels.map((_, rank) => numberOrNull(prices[rank] ?? market.tokens?.[rank]?.price));
  if (normalizedPrices.every((price) => price === null)) {
    bump(exclusionCounts, "invalid_prices");
    return null;
  }
  const totalVolume = numberOrNull(market.volumeNum ?? market.volume) ?? 0;
  const outcomes = outcomeLabels.map((name, rank) => ({
    name,
    externalTokenId: tokenIds[rank] ?? null,
    probability: normalizedPrices[rank] ?? null,
    volume: totalVolume,
    rank
  }));
  const displayOutcome = outcomes.find((outcome) => outcome.name.trim().toLowerCase() === "yes")
    ?? outcomes.reduce((best, outcome) =>
      best.probability === null || (outcome.probability !== null && outcome.probability > best.probability)
        ? outcome
        : best
    );
  const tags = [...new Map([...inheritedTags, ...normalizeTags(market.tags)].map((tag) => [tag.slug, tag])).values()];
  const category = classify(market, tags);
  const marketEndDate = endDate(market);
  if (!marketEndDate || marketEndDate.getTime() <= Date.now()) {
    bump(exclusionCounts, "expired_date_only");
    return null;
  }

  return {
    externalMarketId,
    slug: market.slug ?? slugify(title),
    title,
    description: market.description ?? null,
    groupItemTitle: market.groupItemTitle ?? null,
    sportsMarketType: market.sportsMarketType ?? null,
    gameStartTime: dateOrNull(market.gameStartTime),
    umaResolutionStatus: market.umaResolutionStatus ?? null,
    umaResolutionStatuses: stringArray(market.umaResolutionStatuses),
    resolvedBy: market.resolvedBy ?? null,
    ready: market.ready ?? null,
    approved: market.approved ?? null,
    resolved: market.resolved ?? null,
    period: market.period ?? null,
    finishedTimestamp: dateOrNull(market.finishedTimestamp),
    automaticallyResolved: market.automaticallyResolved ?? null,
    categorySlug: slugify(category.name),
    categoryName: category.name,
    categorySource,
    categoryConfidence: category.confidence,
    status: status(market),
    endDate: marketEndDate,
    active: market.active ?? null,
    closed: market.closed ?? null,
    archived: market.archived ?? null,
    acceptingOrders: market.acceptingOrders ?? null,
    enableOrderBook: market.enableOrderBook ?? null,
    closedTime: dateOrNull(market.closedTime),
    volume: numberOrNull(market.volumeNum ?? market.volume),
    volume24h: numberOrNull(market.volume24hr ?? market.volume24h),
    liquidity: numberOrNull(market.liquidityNum ?? market.liquidity),
    featured: market.featured ?? null,
    isNew: market.new ?? null,
    competitive: numberOrNull(market.competitive),
    oneDayPriceChange: numberOrNull(market.oneDayPriceChange),
    oneHourPriceChange: numberOrNull(market.oneHourPriceChange),
    oneWeekPriceChange: numberOrNull(market.oneWeekPriceChange),
    gammaUpdatedAt: dateOrNull(market.updatedAt),
    tags,
    outcomes,
    snapshot: {
      probability: displayOutcome.probability,
      volume: numberOrNull(market.volumeNum ?? market.volume ?? market.volume24h),
      liquidity: numberOrNull(market.liquidityNum ?? market.liquidity),
      openInterest: numberOrNull(market.openInterest ?? market.open_interest)
    }
  };
};

export const normalizeEvent = (event: GammaEvent, exclusionCounts?: ExclusionCounts): NormalizedEvent | null => {
  const finalReason = eventFinalExclusionReason(event);
  if (finalReason) {
    bump(exclusionCounts, finalReason);
    return null;
  }
  if (!event.id || !event.title) {
    bump(exclusionCounts, "unknown");
    return null;
  }
  const tags = normalizeTags(event.tags);
  const category = classify({ title: event.title, description: event.description }, tags);
  const exclusionsBeforeMarkets = exclusionCounts
    ? Object.values(exclusionCounts).reduce((total, count) => total + count, 0)
    : 0;
  const normalizedMarkets = (event.markets ?? [])
    .map((market) => normalizeMarket(market, tags, "event_tags", exclusionCounts))
    .filter((market) => market !== null);
  if (normalizedMarkets.length === 0) {
    const exclusionsAfterMarkets = exclusionCounts
      ? Object.values(exclusionCounts).reduce((total, count) => total + count, 0)
      : 0;
    if (exclusionsAfterMarkets === exclusionsBeforeMarkets) bump(exclusionCounts, "unknown");
    return null;
  }
  const eventEndDate = dateOrNull(event.endDate);
  if (eventEndDate && eventEndDate.getTime() <= Date.now()) bump(exclusionCounts, "expired_date_only");
  return {
    externalEventId: event.id,
    slug: event.slug ?? slugify(event.title),
    title: event.title,
    description: event.description ?? null,
    startDate: dateOrNull(event.startDate),
    endDate: eventEndDate,
    categorySlug: slugify(category.name),
    categoryName: category.name,
    active: true,
    closed: false,
    archived: event.archived ?? false,
    volume: numberOrNull(event.volume),
    volume24h: numberOrNull(event.volume24hr),
    liquidity: numberOrNull(event.liquidity),
    openInterest: numberOrNull(event.openInterest),
    closedTime: dateOrNull(event.closedTime),
    live: event.live ?? null,
    ended: event.ended ?? null,
    period: event.period ?? null,
    finishedTimestamp: dateOrNull(event.finishedTimestamp),
    score: event.score ?? null,
    automaticallyResolved: event.automaticallyResolved ?? null,
    gammaUpdatedAt: dateOrNull(event.updatedAt),
    tags,
    markets: normalizedMarkets
  };
};
