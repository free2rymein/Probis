import type { WorkerConfig } from "../config/env";
import type { NormalizedMarket } from "../types/events";

type CategoryLabel =
  | "Politics"
  | "Geopolitics"
  | "Finance / Macro"
  | "Technology / AI / Regulation / Chips";

export type RankedMarket = {
  market: NormalizedMarket;
  rank: number | null;
  category: CategoryLabel;
  liquidity: number;
  volume24h: number;
  totalVolume: number;
  probability: number;
  interestScore: number;
};

export type FilteredMarket = {
  title: string;
  category: string;
  liquidity: number;
  volume24h: number;
  totalVolume: number;
  probability: number | null;
  reason: string;
};

export type MarketUniverseSelection = {
  markets: NormalizedMarket[];
  eligibleCount: number;
  selectedCount: number;
  scoredMarkets: RankedMarket[];
  selectedMarkets: RankedMarket[];
  filteredMarkets: FilteredMarket[];
  rejectionCounts: Record<string, number>;
  stats: {
    minVolume: number;
    maxVolume: number;
    avgVolume: number;
    minLiquidity: number;
    maxLiquidity: number;
    avgLiquidity: number;
  };
};

const ALLOWED_CATEGORY_KEYWORDS: Record<CategoryLabel, string[]> = {
  Politics: [
    "election",
    "president",
    "senate",
    "congress",
    "governor",
    "minister",
    "parliament",
    "vote",
    "poll",
    "primary",
    "referendum",
    "policy",
    "party"
  ],
  Geopolitics: [
    "war",
    "ceasefire",
    "ukraine",
    "russia",
    "china",
    "iran",
    "israel",
    "gaza",
    "taiwan",
    "nato",
    "sanction",
    "tariff",
    "summit"
  ],
  "Finance / Macro": [
    "fed",
    "fomc",
    "rate cut",
    "interest rate",
    "inflation",
    "cpi",
    "recession",
    "gdp",
    "bitcoin",
    "crypto",
    "ethereum",
    "stock",
    "s&p",
    "nasdaq",
    "oil",
    "gold",
    "dollar",
    "treasury"
  ],
  "Technology / AI / Regulation / Chips": [
    "ai",
    "artificial intelligence",
    "openai",
    "anthropic",
    "nvidia",
    "chip",
    "semiconductor",
    "regulation",
    "antitrust",
    "sec",
    "ftc",
    "data center",
    "export control"
  ]
};

const SPORTS_KEYWORDS = [
  "nba",
  "nfl",
  "mlb",
  "nhl",
  "uefa",
  "champions league",
  "champions cup",
  "europa league",
  "premier league",
  "la liga",
  "serie a",
  "bundesliga",
  "ligue 1",
  "fifa",
  "world cup",
  "tournament",
  "soccer",
  "football",
  "real madrid",
  "barcelona",
  "psg",
  "paris saint-germain",
  "manchester city",
  "man city",
  "manchester united",
  "liverpool",
  "arsenal",
  "chelsea",
  "bayern",
  "bayern munich",
  "borussia dortmund",
  "dortmund",
  "juventus",
  "inter milan",
  "ac milan",
  "atletico",
  "benfica",
  "ajax",
  "tottenham",
  "newcastle",
  "tennis",
  "ufc",
  "boxing",
  "f1",
  "formula 1",
  "team",
  "player",
  "match",
  "game",
  "club",
  "fc "
];

const NON_SPORT_EXCLUDED_KEYWORDS = [
  "esports",
  "league of legends",
  "counter-strike",
  "valorant",
  "movie",
  "album",
  "grammy",
  "oscar",
  "celebrity",
  "taylor swift",
  "kardashian",
  "meme"
];

const numericValue = (value: string | null | undefined) => {
  if (value === null || value === undefined || value === "") return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const optionalNumber = (value: string | null | undefined) => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const metadataTags = (market: NormalizedMarket) => {
  const raw = market.metadata.tags;
  if (!Array.isArray(raw)) return [];
  return raw.map(String);
};

const metadataString = (market: NormalizedMarket, key: string) => {
  const value = market.metadata[key];
  return typeof value === "string" ? value : null;
};

const metadataBoolean = (market: NormalizedMarket, key: string) => market.metadata[key] === true;

const marketText = (market: NormalizedMarket) =>
  [
    market.title,
    market.slug,
    market.description,
    market.category,
    metadataString(market, "raw_category"),
    metadataString(market, "subtitle"),
    metadataString(market, "rules"),
    metadataString(market, "resolution_source"),
    metadataString(market, "market_group"),
    metadataString(market, "group_item_title"),
    metadataString(market, "event_title"),
    metadataString(market, "series_title"),
    ...metadataTags(market)
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

const parseDate = (value: string | null) => {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const resolutionDate = (market: NormalizedMarket) =>
  market.resolutionDate ?? parseDate(metadataString(market, "end_date"));

const totalVolume = (market: NormalizedMarket) =>
  numericValue(metadataString(market, "gamma_volume"));

const probability = (market: NormalizedMarket) => {
  const parsed = optionalNumber(market.currentProbability);
  if (parsed === null || parsed < 0 || parsed > 1) return null;
  return parsed;
};

const excludedReason = (market: NormalizedMarket, config: WorkerConfig) => {
  const text = marketText(market);
  if (config.EXCLUDE_SPORTS_MARKETS && SPORTS_KEYWORDS.some((keyword) => text.includes(keyword))) {
    return "excluded_sports_keyword";
  }
  if (
    config.EXCLUDE_ESPORTS_MARKETS &&
    NON_SPORT_EXCLUDED_KEYWORDS.some((keyword) => text.includes(keyword))
  ) {
    return "excluded_keyword";
  }
  if (!config.EXCLUDE_ESPORTS_MARKETS) {
    const relaxed = NON_SPORT_EXCLUDED_KEYWORDS.filter(
      (keyword) => !["esports", "league of legends", "counter-strike", "valorant"].includes(keyword)
    );
    if (relaxed.some((keyword) => text.includes(keyword))) return "excluded_keyword";
  }

  return null;
};

const classifyMarket = (market: NormalizedMarket): CategoryLabel | null => {
  const text = marketText(market);
  for (const [category, keywords] of Object.entries(ALLOWED_CATEGORY_KEYWORDS)) {
    if (keywords.some((keyword) => text.includes(keyword))) return category as CategoryLabel;
  }

  return null;
};

const rejectionReason = (
  market: NormalizedMarket,
  config: WorkerConfig,
  now: Date,
  category: CategoryLabel | null,
  prob: number | null,
  liquidity: number,
  total: number
) => {
  if (market.status !== "open") return "inactive_or_closed";
  if (metadataBoolean(market, "closed") || metadataBoolean(market, "resolved")) {
    return "inactive_or_closed";
  }
  if (metadataBoolean(market, "archived")) return "archived";
  if (!market.conditionId) return "missing_condition_id";
  if (market.clobTokenIds.length === 0) return "missing_clob_token_ids";
  if (prob === null) return "invalid_probability";

  const resolvedAt = resolutionDate(market);
  if (!resolvedAt) return "missing_resolution_date";
  if (resolvedAt <= now) return "already_resolved_or_expired";
  if (resolvedAt > new Date(now.getTime() + config.MAX_DAYS_TO_RESOLUTION * 24 * 60 * 60 * 1000)) {
    return "resolves_after_45_days";
  }

  const excluded = excludedReason(market, config);
  if (excluded) return excluded;
  if (category === null) return "out_of_scope_category";
  if (liquidity < config.MIN_MARKET_LIQUIDITY) return "low_liquidity";
  if (total < config.MIN_MARKET_VOLUME_TOTAL) return "low_total_volume";

  return null;
};

const interestScore = (volume24h: number, total: number, liquidity: number) => {
  const rankingVolume = volume24h > 0 ? volume24h : total;
  return Math.log10(rankingVolume + 1) * 0.6 + Math.log10(Math.max(0, liquidity) + 1) * 0.4;
};

const scoreStats = (markets: RankedMarket[]) => {
  if (markets.length === 0) {
    return {
      minVolume: 0,
      maxVolume: 0,
      avgVolume: 0,
      minLiquidity: 0,
      maxLiquidity: 0,
      avgLiquidity: 0
    };
  }

  const volumes = markets.map((market) =>
    market.volume24h > 0 ? market.volume24h : market.totalVolume
  );
  const liquidities = markets.map((market) => market.liquidity);
  const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

  return {
    minVolume: Math.min(...volumes),
    maxVolume: Math.max(...volumes),
    avgVolume: sum(volumes) / volumes.length,
    minLiquidity: Math.min(...liquidities),
    maxLiquidity: Math.max(...liquidities),
    avgLiquidity: sum(liquidities) / liquidities.length
  };
};

export const selectMarketUniverse = (
  markets: NormalizedMarket[],
  config: WorkerConfig,
  _context = new Map(),
  now = new Date()
): MarketUniverseSelection => {
  const rejectionCounts: Record<string, number> = {};
  const filteredMarkets: FilteredMarket[] = [];
  const seenConditionIds = new Set<string>();

  const resetMarkets = markets.map((market) => ({
    ...market,
    isActiveUniverse: false,
    marketQualityScore: null,
    universeTier: null,
    intelligenceWeightedScore: null,
    repricingVelocityScore: null,
    narrativeRelevanceScore: null,
    walletActivityScore: null,
    exclusionReason: null,
    universeRank: null,
    lastSelectedAt: null
  }));

  const eligible: RankedMarket[] = [];

  for (const market of resetMarkets) {
    const conditionId = market.conditionId ?? "";
    if (!conditionId || seenConditionIds.has(conditionId)) continue;
    seenConditionIds.add(conditionId);

    const category = classifyMarket(market);
    const liquidity = numericValue(market.liquidity);
    const total = totalVolume(market);
    const volume24h = numericValue(market.volume24h);
    const prob = probability(market);
    const reason = rejectionReason(market, config, now, category, prob, liquidity, total);

    if (reason) {
      rejectionCounts[reason] = (rejectionCounts[reason] ?? 0) + 1;
      filteredMarkets.push({
        title: market.title,
        category: market.category,
        liquidity,
        volume24h,
        totalVolume: total,
        probability: prob,
        reason
      });
      continue;
    }

    if (!category || prob === null) continue;
    eligible.push({
      market: {
        ...market,
        category
      },
      rank: null,
      category,
      liquidity,
      volume24h,
      totalVolume: total,
      probability: prob,
      interestScore: interestScore(volume24h, total, liquidity)
    });
  }

  const scoredMarkets = [...eligible].sort((a, b) => {
    if (b.interestScore !== a.interestScore) return b.interestScore - a.interestScore;
    if (b.totalVolume !== a.totalVolume) return b.totalVolume - a.totalVolume;
    return b.liquidity - a.liquidity;
  });

  const selectedMarkets = scoredMarkets
    .slice(0, config.ACTIVE_MARKET_UNIVERSE_LIMIT)
    .map((market, index) => ({
      ...market,
      rank: index + 1
    }));
  const selectedByConditionId = new Map(
    selectedMarkets.map((market) => [market.market.conditionId, market])
  );
  const scoredByConditionId = new Map(
    scoredMarkets.map((market) => [market.market.conditionId, market])
  );
  const rejectedByConditionId = new Map(
    filteredMarkets.map((filtered) => {
      const match = resetMarkets.find((market) => market.title === filtered.title);
      return [match?.conditionId ?? filtered.title, filtered.reason] as const;
    })
  );

  return {
    markets: resetMarkets.map((market) => {
      const selected = selectedByConditionId.get(market.conditionId);
      const scored = selected ?? scoredByConditionId.get(market.conditionId);
      const exclusionReason = rejectedByConditionId.get(market.conditionId ?? market.title) ?? null;

      return {
        ...market,
        category: scored?.category ?? market.category,
        isActiveUniverse: Boolean(selected),
        marketQualityScore: scored ? scored.interestScore.toFixed(6) : null,
        universeTier: selected ? "tracked" : null,
        intelligenceWeightedScore: scored ? scored.interestScore.toFixed(6) : null,
        repricingVelocityScore: null,
        narrativeRelevanceScore: null,
        walletActivityScore: null,
        exclusionReason,
        universeRank: selected?.rank ?? null,
        lastSelectedAt: selected ? now : null
      };
    }),
    eligibleCount: eligible.length,
    selectedCount: selectedMarkets.length,
    scoredMarkets,
    selectedMarkets,
    filteredMarkets,
    rejectionCounts,
    stats: scoreStats(selectedMarkets)
  };
};
