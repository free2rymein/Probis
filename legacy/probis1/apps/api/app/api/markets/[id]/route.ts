import type {
  CrossMarketIntelligence,
  AttentionRegime,
  LiquidityRegime,
  MarketDetail,
  MarketNarrativeSummary,
  MarketRegime,
  MarketRegimeSummary,
  MarketTimelineItem,
  NarrativeStrength,
  NarrativeTheme,
  VolatilityRegime,
  RelatedMarketNarrative,
  WalletArchetype
} from "@probis/types";
import { getSql } from "@/lib/db";
import { withApiHandler } from "@/lib/handler";
import { corsHeaders, fail, ok } from "@/lib/responses";

type RouteContext = {
  params: Promise<{ id: string }> | { id: string };
};

const routeParams = async (routeContext: unknown) => {
  const params = (routeContext as RouteContext | undefined)?.params;
  return params ? await params : null;
};

type MarketRow = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  source: string;
  category: string;
  status: MarketDetail["market"]["status"];
  condition_id: string | null;
  clob_token_ids: string[];
  yes_probability: string | null;
  volume_24h: string | null;
  liquidity: string | null;
  is_active_universe: boolean;
  market_quality_score: string | null;
  universe_tier: string | null;
  intelligence_weighted_score: string | null;
  repricing_velocity_score: string | null;
  narrative_relevance_score: string | null;
  wallet_activity_score: string | null;
  exclusion_reason: string | null;
  universe_rank: number | null;
  latest_aggregate_bucket: Date | null;
  resolution_date: Date | null;
  updated_at: Date;
};

type RelatedMarketRow = {
  id: string;
  title: string;
  category: string;
  recent_signal_count: string;
  recent_volume: string | null;
  shared_wallet_count: string;
  first_activity_at: Date | null;
  latest_activity_at: Date | null;
};

const archetypes = new Set<WalletArchetype>([
  "whale",
  "sniper",
  "momentum_trader",
  "high_frequency_scalper",
  "concentrated_conviction_buyer",
  "broad_diversified_trader",
  "emerging_wallet",
  "inactive_wallet",
  "low_activity_wallet",
  "directional_buyer",
  "directional_seller"
]);

const metadataString = (metadata: Record<string, unknown> | null, key: string) => {
  const value = metadata?.[key];
  return typeof value === "string" ? value : null;
};

const metadataNumber = (metadata: Record<string, unknown> | null, key: string) => {
  const value = metadata?.[key];
  const parsed =
    typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
};

const walletArchetype = (metadata: Record<string, unknown> | null) => {
  const value = metadataString(metadata, "archetype");
  return value && archetypes.has(value as WalletArchetype) ? (value as WalletArchetype) : null;
};

const severityLabel = (score: number): MarketTimelineItem["severity"] => {
  if (score >= 70) return "high impact";
  if (score >= 45) return "meaningful";
  return "watchlist";
};

const anomalyTitle = (anomalyType: string, signalKind: string | null) => {
  if (signalKind === "large_concentrated_yes_buying") return "Large concentrated YES buying";
  if (signalKind === "high_conviction_accumulation") return "High-conviction accumulation";
  if (signalKind === "unusual_wallet_activity") return "Unusual wallet activity";
  if (signalKind === "synchronized_directional_flow") return "Synchronized directional flow";
  return anomalyType.replaceAll("_", " ");
};

const formatNumber = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1
  }).format(value);

const THEME_KEYWORDS: Array<{
  theme: NarrativeTheme;
  label: string;
  keywords: string[];
}> = [
  {
    theme: "election_uncertainty",
    label: "Election uncertainty",
    keywords: [
      "election",
      "president",
      "senate",
      "congress",
      "poll",
      "vote",
      "primary",
      "trump",
      "biden",
      "vance"
    ]
  },
  {
    theme: "monetary_policy",
    label: "Monetary policy",
    keywords: ["fed", "fomc", "rate cut", "interest rate", "cpi", "inflation", "treasury"]
  },
  {
    theme: "geopolitical_escalation",
    label: "Geopolitical escalation",
    keywords: ["china", "taiwan", "iran", "israel", "gaza", "ukraine", "russia", "nato", "sanction"]
  },
  {
    theme: "ai_regulation",
    label: "AI regulation",
    keywords: [
      "ai",
      "artificial intelligence",
      "openai",
      "anthropic",
      "nvidia",
      "chip",
      "semiconductor",
      "regulation",
      "antitrust"
    ]
  },
  {
    theme: "crypto_etf_optimism",
    label: "Crypto ETF optimism",
    keywords: ["bitcoin", "ethereum", "crypto", "etf", "sec"]
  },
  {
    theme: "recession_fears",
    label: "Recession fears",
    keywords: ["recession", "gdp", "unemployment", "jobs", "payroll"]
  },
  {
    theme: "energy_shock",
    label: "Energy shock",
    keywords: ["oil", "gas", "energy", "opec", "brent", "wti"]
  },
  {
    theme: "conflict_escalation",
    label: "Conflict escalation",
    keywords: ["war", "ceasefire", "missile", "invasion", "attack", "conflict"]
  },
  {
    theme: "trade_war_risk",
    label: "Trade war risk",
    keywords: ["tariff", "trade war", "export control", "import", "trade deal"]
  },
  {
    theme: "liquidity_stress",
    label: "Liquidity stress",
    keywords: ["liquidity", "bank", "credit", "default", "debt", "treasury"]
  }
];

const themeLabel = (theme: NarrativeTheme) =>
  THEME_KEYWORDS.find((candidate) => candidate.theme === theme)?.label ??
  theme.replaceAll("_", " ");

const inferNarrativeThemes = (...parts: Array<string | null | undefined>) => {
  const haystack = parts.filter(Boolean).join(" ").toLowerCase();
  const matched = THEME_KEYWORDS.filter(({ keywords }) =>
    keywords.some((keyword) => haystack.includes(keyword))
  ).map(({ theme }) => theme);

  if (matched.length > 0) return Array.from(new Set(matched));
  return ["geopolitical_escalation"] satisfies NarrativeTheme[];
};

const narrativeStrength = (score: number): NarrativeStrength => {
  if (score >= 80) return "dominant";
  if (score >= 55) return "active";
  if (score >= 30) return "emerging";
  return "weak";
};

const buildMarketNarrative = ({
  market,
  probabilityHistory,
  volumeHistory,
  timeline,
  walletRows,
  anomalyRows,
  relatedMarkets
}: {
  market: MarketRow;
  probabilityHistory: Array<{ bucket: string; yesProbability: number }>;
  volumeHistory: Array<{ bucket: string; volume: number; tradeCount: number }>;
  timeline: MarketTimelineItem[];
  walletRows: Array<{ wallet_metadata: Record<string, unknown> | null }>;
  anomalyRows: Array<{
    anomaly_type: string;
    severity_score: string;
    metadata: Record<string, unknown>;
  }>;
  relatedMarkets: RelatedMarketNarrative[];
}): MarketNarrativeSummary => {
  const themes = inferNarrativeThemes(market.category, market.title, market.description);
  const primaryTheme = themes[0] ?? "geopolitical_escalation";
  const firstProbability = probabilityHistory[0]?.yesProbability;
  const latestProbability = probabilityHistory.at(-1)?.yesProbability;
  const probabilityMove =
    firstProbability === undefined || latestProbability === undefined
      ? 0
      : Math.abs(latestProbability - firstProbability);
  const averageVolume =
    volumeHistory.reduce((sum, point) => sum + point.volume, 0) / Math.max(1, volumeHistory.length);
  const latestVolume = volumeHistory.at(-1)?.volume ?? 0;
  const volumeRatio = averageVolume > 0 ? latestVolume / averageVolume : 0;
  const walletSpecializations = walletRows.flatMap((row) => {
    const value = row.wallet_metadata?.specialization_tags;
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === "string")
      : [];
  });
  const alignedWalletCount = walletSpecializations.filter((tag) => {
    if (primaryTheme === "crypto_etf_optimism") return tag === "crypto";
    if (primaryTheme === "monetary_policy" || primaryTheme === "recession_fears")
      return tag === "macro";
    if (primaryTheme === "ai_regulation") return tag === "tech_ai";
    if (primaryTheme === "election_uncertainty") return tag === "politics";
    return tag === "geopolitics";
  }).length;
  const highImpactEvents = timeline.filter((item) => item.severity === "high impact").length;
  const coordinatedSignals = anomalyRows.filter(
    (row) =>
      row.anomaly_type === "coordinated_wallet_activity" ||
      row.metadata.signal_kind === "synchronized_directional_flow"
  ).length;
  const strengthScore = Math.min(
    100,
    anomalyRows.length * 9 +
      relatedMarkets.length * 10 +
      alignedWalletCount * 5 +
      highImpactEvents * 10 +
      coordinatedSignals * 12 +
      Math.min(18, probabilityMove * 120) +
      Math.min(16, volumeRatio * 5)
  );
  const strength = narrativeStrength(strengthScore);
  const attentionState =
    volumeRatio >= 1.75 || anomalyRows.length >= 3
      ? "suggests elevated attention"
      : timeline.length >= 3
        ? "suggests attention is building"
        : "does not yet show a clear attention shift";
  const driverParts = [
    probabilityMove >= 0.03
      ? `YES probability moved ${(probabilityMove * 100).toFixed(1)} points across available history.`
      : null,
    volumeRatio >= 1.5 ? `Latest volume is ${volumeRatio.toFixed(1)}x the recent baseline.` : null,
    coordinatedSignals > 0
      ? "Synchronized wallet-flow signals appear correlated with the theme."
      : null,
    alignedWalletCount > 0
      ? `${alignedWalletCount} recent wallet-flow entries came from wallets with relevant specialization tags.`
      : null,
    relatedMarkets.length > 0
      ? "Related markets show overlapping category or theme activity."
      : null
  ].filter((item): item is string => Boolean(item));

  return {
    primaryTheme,
    strength,
    headline: `${themeLabel(primaryTheme)} narrative ${strength}.`,
    narrativeContext: `${themeLabel(
      primaryTheme
    )} appears correlated with recent prediction-market activity in this market. This is contextual interpretation from internal flow, timeline, and signal data, not a causal claim.`,
    potentialDrivers:
      driverParts.length > 0
        ? driverParts
        : ["Internal market activity is still too sparse to isolate a clear potential driver."],
    relatedThemes: themes.slice(1, 5),
    attentionShift: `Recent market behavior ${attentionState}; interpret this as correlation rather than confirmed causality.`,
    relatedMarkets,
    confidence: Math.round(strengthScore)
  };
};

const clusterName = (theme: NarrativeTheme) => {
  if (theme === "ai_regulation") return "AI / Regulation";
  if (theme === "monetary_policy") return "Monetary Policy";
  if (theme === "election_uncertainty") return "Elections";
  if (theme === "trade_war_risk") return "Trade War";
  if (theme === "conflict_escalation" || theme === "geopolitical_escalation") {
    return "Conflict Escalation";
  }
  if (theme === "crypto_etf_optimism") return "Crypto ETF";
  if (theme === "energy_shock") return "Energy Markets";
  if (theme === "recession_fears") return "Recession Risk";
  return "Liquidity Stress";
};

const leadLagStatus = (
  currentFirstActivityAt: Date | null,
  relatedFirstActivityAt: Date | null
): "leading" | "lagging" | "synchronized" | "unclear" => {
  if (!currentFirstActivityAt || !relatedFirstActivityAt) return "unclear";
  const diffMs = relatedFirstActivityAt.getTime() - currentFirstActivityAt.getTime();
  if (Math.abs(diffMs) <= 30 * 60_000) return "synchronized";
  return diffMs > 0 ? "leading" : "lagging";
};

const buildCrossMarketIntelligence = ({
  market,
  theme,
  timeline,
  relatedMarketRows,
  relatedMarkets,
  sharedWalletCount
}: {
  market: MarketRow;
  theme: NarrativeTheme;
  timeline: MarketTimelineItem[];
  relatedMarketRows: RelatedMarketRow[];
  relatedMarkets: RelatedMarketNarrative[];
  sharedWalletCount: number;
}): CrossMarketIntelligence => {
  const currentFirstActivityAt =
    timeline.length > 0
      ? new Date(Math.min(...timeline.map((item) => new Date(item.timestamp).getTime())))
      : null;
  const enrichedRelated = relatedMarkets.map((related) => {
    const row = relatedMarketRows.find((candidate) => candidate.id === related.marketId);
    const synchronizedSignalCount = Number(row?.recent_signal_count ?? 0);
    const relatedSharedWalletCount = Number(row?.shared_wallet_count ?? 0);
    const status = leadLagStatus(currentFirstActivityAt, row?.first_activity_at ?? null);
    const reasons = [
      row?.category === market.category ? "category overlap" : null,
      related.sharedTheme === theme ? "theme overlap" : null,
      synchronizedSignalCount > 0 ? "synchronized signal activity" : null,
      relatedSharedWalletCount > 0 ? "shared wallet participation" : null,
      Number(row?.recent_volume ?? 0) > 0 ? "recent volume activity" : null
    ].filter((reason): reason is string => Boolean(reason));

    return {
      ...related,
      relationshipReasons: reasons.length ? reasons : ["nearby thematic market"],
      sharedWalletCount: relatedSharedWalletCount,
      synchronizedSignalCount,
      latestActivityAt: row?.latest_activity_at?.toISOString() ?? null,
      leadLagStatus: status
    };
  });
  const synchronizedMarketCount = enrichedRelated.filter(
    (related) => related.leadLagStatus === "synchronized" || related.synchronizedSignalCount > 0
  ).length;
  const leadingCount = enrichedRelated.filter(
    (related) => related.leadLagStatus === "leading"
  ).length;
  const laggingCount = enrichedRelated.filter(
    (related) => related.leadLagStatus === "lagging"
  ).length;
  const leadingStatus =
    leadingCount > laggingCount
      ? "leading"
      : laggingCount > leadingCount
        ? "lagging"
        : synchronizedMarketCount > 0
          ? "synchronized"
          : "unclear";
  const attentionState =
    synchronizedMarketCount >= 3
      ? "spreading"
      : synchronizedMarketCount >= 2
        ? "synchronized"
        : enrichedRelated.length >= 2
          ? "building"
          : "quiet";
  const leadingMarketTitle =
    leadingStatus === "lagging"
      ? (enrichedRelated
          .filter((related) => related.leadLagStatus === "lagging")
          .sort(
            (left, right) =>
              new Date(left.latestActivityAt ?? 0).getTime() -
              new Date(right.latestActivityAt ?? 0).getTime()
          )[0]?.title ?? null)
      : leadingStatus === "leading"
        ? market.title
        : null;
  const confidence = Math.min(
    100,
    enrichedRelated.length * 10 + synchronizedMarketCount * 15 + sharedWalletCount * 8
  );
  const propagation = enrichedRelated
    .filter((related) => related.latestActivityAt)
    .slice(0, 6)
    .map((related) => ({
      id: `cross-market-${related.marketId}`,
      timestamp: related.latestActivityAt ?? new Date().toISOString(),
      theme,
      marketId: related.marketId,
      marketTitle: related.title,
      eventType:
        related.sharedWalletCount > 0
          ? ("shared_wallet_flow" as const)
          : related.synchronizedSignalCount > 0
            ? ("signal_cluster" as const)
            : ("volume_activity" as const),
      explanation:
        related.leadLagStatus === "leading"
          ? `${market.title} appears to have moved before this related market within the observed window.`
          : related.leadLagStatus === "lagging"
            ? `${related.title} showed related activity before this market; this market may be reacting.`
            : `${related.title} showed related activity close to this market's activity window.`,
      confidence: Math.min(
        95,
        35 + related.synchronizedSignalCount * 12 + related.sharedWalletCount * 15
      )
    }));

  return {
    clusterName: clusterName(theme),
    theme,
    summary:
      attentionState === "spreading"
        ? `${clusterName(theme)} attention appears to be spreading across related markets.`
        : attentionState === "synchronized"
          ? `Multiple ${clusterName(theme)} markets are active in the same observed window.`
          : attentionState === "building"
            ? `${clusterName(theme)} related markets show early signs of clustered attention.`
            : `Cross-market ${clusterName(theme)} activity is still quiet.`,
    attentionState,
    leadingStatus,
    leadingMarketTitle,
    relatedMarkets: enrichedRelated,
    propagation,
    sharedWalletCount,
    synchronizedMarketCount,
    confidence
  };
};

const classifyAttentionRegime = (
  anomalyCount: number,
  walletCount: number,
  crossMarket: CrossMarketIntelligence,
  volumeRatio: number
): AttentionRegime => {
  const score =
    anomalyCount * 9 +
    walletCount * 3 +
    crossMarket.synchronizedMarketCount * 12 +
    Math.min(20, volumeRatio * 6);
  if (score >= 70) return "overheated";
  if (score >= 50) return "dominant";
  if (score >= 30) return "elevated";
  if (score >= 12) return "active";
  return "dormant";
};

const classifyVolatilityRegime = (
  probabilityMoves: number[],
  latestDelta: number
): VolatilityRegime => {
  const totalMove = probabilityMoves.reduce((sum, move) => sum + Math.abs(move), 0);
  const directionChanges = probabilityMoves.filter((move, index) => {
    const previous = probabilityMoves[index - 1];
    return previous !== undefined && Math.sign(previous) !== Math.sign(move);
  }).length;

  if (directionChanges >= 3 && totalMove >= 0.12) return "unstable_probability_swings";
  if (Math.abs(latestDelta) >= 0.06 && totalMove >= 0.1) return "directional_acceleration";
  if (totalMove >= 0.16) return "elevated_uncertainty";
  if (Math.abs(latestDelta) >= 0.04 || totalMove >= 0.08) return "rapid_repricing";
  return "stable_pricing";
};

const classifyLiquidityRegime = (
  liquidity: number,
  volume24h: number,
  probabilityMove: number
): LiquidityRegime => {
  const volumeLiquidityRatio = liquidity > 0 ? volume24h / liquidity : volume24h > 0 ? 99 : 0;
  if (liquidity < 1_000 || (probabilityMove >= 0.06 && liquidity < 3_000)) {
    return "stressed_liquidity";
  }
  if (liquidity < 5_000 || volumeLiquidityRatio >= 3) return "thinning_liquidity";
  if (liquidity >= 50_000 && volumeLiquidityRatio < 1.5) return "deep_liquidity";
  return "normal_liquidity";
};

const classifyMarketRegime = ({
  attention,
  volatility,
  liquidity,
  volumeRatio,
  anomalyCount,
  crossMarket,
  latestDelta,
  earlierRegime
}: {
  attention: AttentionRegime;
  volatility: VolatilityRegime;
  liquidity: LiquidityRegime;
  volumeRatio: number;
  anomalyCount: number;
  crossMarket: CrossMarketIntelligence;
  latestDelta: number;
  earlierRegime?: MarketRegime;
}): MarketRegime => {
  if (
    attention === "overheated" ||
    (crossMarket.attentionState === "spreading" && anomalyCount >= 3)
  ) {
    return "narrative_overheating";
  }
  if (attention === "dominant" && volumeRatio >= 3) return "speculative_frenzy";
  if (liquidity === "stressed_liquidity") return "liquidity_stress";
  if (volatility === "unstable_probability_swings" || volatility === "elevated_uncertainty") {
    return "high_volatility";
  }
  if (
    volatility === "directional_acceleration" ||
    (Math.abs(latestDelta) >= 0.04 && anomalyCount > 0)
  ) {
    return "momentum_driven";
  }
  if (attention === "elevated" || attention === "dominant") return "elevated_attention";
  if (earlierRegime && earlierRegime !== "quiet" && volumeRatio <= 0.65 && anomalyCount <= 1) {
    return "fading_attention";
  }
  if (earlierRegime && earlierRegime !== "quiet" && volatility === "stable_pricing") {
    return "stabilization";
  }
  return "quiet";
};

const regimeSummaryText = (
  regime: MarketRegime,
  attention: AttentionRegime,
  volatility: VolatilityRegime,
  liquidity: LiquidityRegime
) =>
  `${regime.replaceAll("_", " ")} regime detected. Attention appears ${attention.replaceAll(
    "_",
    " "
  )}, pricing looks ${volatility.replaceAll("_", " ")}, and liquidity appears ${liquidity.replaceAll(
    "_",
    " "
  )}. Treat this as a heuristic market-state read, not a deterministic forecast.`;

const buildMarketRegime = ({
  market,
  probabilityHistory,
  volumeHistory,
  walletRows,
  anomalyRows,
  timeline,
  crossMarket
}: {
  market: MarketRow;
  probabilityHistory: Array<{ bucket: string; yesProbability: number }>;
  volumeHistory: Array<{ bucket: string; volume: number; tradeCount: number }>;
  walletRows: Array<{ wallet_address: string }>;
  anomalyRows: Array<{ detected_at: Date }>;
  timeline: MarketTimelineItem[];
  crossMarket: CrossMarketIntelligence;
}): MarketRegimeSummary => {
  const probabilityMoves = probabilityHistory.slice(1).map((point, index) => {
    const previous = probabilityHistory[index]?.yesProbability ?? point.yesProbability;
    return point.yesProbability - previous;
  });
  const latestDelta = probabilityMoves.at(-1) ?? 0;
  const totalProbabilityMove = probabilityMoves.reduce((sum, move) => sum + Math.abs(move), 0);
  const averageVolume =
    volumeHistory.reduce((sum, point) => sum + point.volume, 0) / Math.max(1, volumeHistory.length);
  const latestVolume = volumeHistory.at(-1)?.volume ?? 0;
  const volumeRatio = averageVolume > 0 ? latestVolume / averageVolume : 0;
  const recentAnomalyCount = anomalyRows.filter(
    (row) => Date.now() - row.detected_at.getTime() <= 6 * 60 * 60 * 1000
  ).length;
  const attention = classifyAttentionRegime(
    recentAnomalyCount,
    walletRows.length,
    crossMarket,
    volumeRatio
  );
  const volatility = classifyVolatilityRegime(probabilityMoves.slice(-12), latestDelta);
  const liquidity = classifyLiquidityRegime(
    Number(market.liquidity ?? 0),
    Number(market.volume_24h ?? 0),
    totalProbabilityMove
  );
  const midpoint = Math.max(1, Math.floor(volumeHistory.length / 2));
  const earlierAverageVolume =
    volumeHistory.slice(0, midpoint).reduce((sum, point) => sum + point.volume, 0) /
    Math.max(1, midpoint);
  const earlierVolumeRatio = earlierAverageVolume > 0 ? averageVolume / earlierAverageVolume : 0;
  const earlierRegime = classifyMarketRegime({
    attention: earlierVolumeRatio > 1.5 ? "elevated" : "active",
    volatility: totalProbabilityMove >= 0.08 ? "rapid_repricing" : "stable_pricing",
    liquidity,
    volumeRatio: earlierVolumeRatio,
    anomalyCount: Math.max(0, anomalyRows.length - recentAnomalyCount),
    crossMarket,
    latestDelta
  });
  const regime = classifyMarketRegime({
    attention,
    volatility,
    liquidity,
    volumeRatio,
    anomalyCount: recentAnomalyCount,
    crossMarket,
    latestDelta,
    earlierRegime
  });
  const transition =
    regime !== earlierRegime
      ? {
          from: earlierRegime,
          to: regime,
          detectedAt: timeline[0]?.timestamp ?? null,
          explanation: `${earlierRegime.replaceAll("_", " ")} appears to be transitioning toward ${regime.replaceAll(
            "_",
            " "
          )} based on recent volume, anomaly density, and probability movement.`
        }
      : null;
  const indicators = [
    recentAnomalyCount > 0 ? `${recentAnomalyCount} recent anomalies` : "low anomaly density",
    volumeRatio > 0 ? `${volumeRatio.toFixed(1)}x volume baseline` : "no volume baseline",
    `${(totalProbabilityMove * 100).toFixed(1)} pts cumulative YES movement`,
    `${crossMarket.synchronizedMarketCount} synchronized related markets`,
    `${walletRows.length} active wallets in recent flow`
  ];

  return {
    regime,
    attention,
    volatility,
    liquidity,
    transition,
    summary: regimeSummaryText(regime, attention, volatility, liquidity),
    indicators,
    confidence: Math.min(
      100,
      25 + recentAnomalyCount * 8 + walletRows.length * 2 + crossMarket.synchronizedMarketCount * 10
    )
  };
};

const buildReplaySummary = (timeline: MarketTimelineItem[]): MarketDetail["replaySummary"] => {
  if (timeline.length === 0) {
    return {
      headline: "No replayable market intelligence yet.",
      sequence:
        "The market has not accumulated enough probability, volume, trade, or anomaly events.",
      walletFlowTiming: "No wallet-flow timing relationship is available.",
      activityState: "quiet"
    };
  }

  const chronological = [...timeline].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );
  const first = chronological[0];
  const firstProbability = chronological.find((item) => item.eventType === "probability_move");
  const firstWalletFlow = chronological.find(
    (item) => item.eventType === "wallet_flow_anomaly" || item.eventType === "large_trade"
  );
  const anomalyCount = timeline.filter((item) => item.eventType === "wallet_flow_anomaly").length;
  const concentratedCount = timeline.filter(
    (item) => item.eventType === "wallet_flow_anomaly" || item.eventType === "large_trade"
  ).length;
  const highImpactCount = timeline.filter((item) => item.severity === "high impact").length;

  let activityState: MarketDetail["replaySummary"]["activityState"] = "quiet";
  if (highImpactCount > 0 || anomalyCount >= 2) activityState = "unusual";
  else if (concentratedCount >= 3) activityState = "concentrated";
  else if (timeline.length >= 4) activityState = "elevated";

  let walletFlowTiming = "Wallet flow and probability movement have not overlapped clearly yet.";
  if (firstProbability && firstWalletFlow) {
    const probabilityTime = new Date(firstProbability.timestamp).getTime();
    const walletTime = new Date(firstWalletFlow.timestamp).getTime();
    walletFlowTiming =
      walletTime < probabilityTime
        ? "Wallet flow appeared before the first observed probability move; treat this as correlation, not proven causality."
        : walletTime > probabilityTime
          ? "Wallet flow appeared after the first observed probability move; this may reflect reaction rather than cause."
          : "Wallet flow and probability movement appeared in the same observed minute.";
  }

  return {
    headline: `${activityState[0]?.toUpperCase()}${activityState.slice(1)} recent market activity.`,
    sequence: `First replayable event: ${first?.explanation ?? "n/a"}`,
    walletFlowTiming,
    activityState
  };
};

export const GET = withApiHandler(async (_request, { requestId }, routeContext) => {
  const params = await routeParams(routeContext);
  const id = params?.id;

  if (!id) {
    return fail("VALIDATION_ERROR", "Market id is required.", requestId, { status: 400 });
  }

  const sql = getSql();
  const [market] = await sql<MarketRow[]>`
    SELECT
      m.id,
      m.slug,
      m.title,
      m.description,
      m.source::text AS source,
      m.category,
      m.status::text AS status,
      m.condition_id,
      m.clob_token_ids,
      COALESCE(m.current_probability_yes, m.current_probability)::text AS yes_probability,
      COALESCE(m.volume_24h, NULLIF(m.metadata->>'gamma_volume', '')::numeric, volume_24h.value)::text AS volume_24h,
      m.liquidity::text,
      m.is_active_universe,
      m.market_quality_score::text,
      m.universe_tier,
      m.intelligence_weighted_score::text,
      m.repricing_velocity_score::text,
      m.narrative_relevance_score::text,
      m.wallet_activity_score::text,
      m.exclusion_reason,
      m.universe_rank,
      latest.bucket AS latest_aggregate_bucket,
      m.resolution_date,
      m.updated_at
    FROM markets m
    LEFT JOIN LATERAL (
      SELECT a.bucket
      FROM market_aggregates_1m a
      WHERE a.market_id = m.id
      ORDER BY a.bucket DESC
      LIMIT 1
    ) latest ON true
    LEFT JOIN LATERAL (
      SELECT COALESCE(SUM(a.volume), 0) AS value
      FROM market_aggregates_1m a
      WHERE a.market_id = m.id
        AND a.bucket >= now() - interval '24 hours'
    ) volume_24h ON true
    WHERE m.id = ${id}
    LIMIT 1
  `;

  if (!market) {
    return fail("NOT_FOUND", "Market not found.", requestId, { status: 404 });
  }

  const [probabilityRows, volumeRows, tradeRows, walletRows, anomalyRows] = await Promise.all([
    sql<Array<{ bucket: Date; yes_probability: string }>>`
      SELECT
        date_trunc('minute', trade_timestamp) AS bucket,
        AVG(price)::text AS yes_probability
      FROM trades
      WHERE market_id = ${id}
        AND lower(COALESCE(outcome, '')) = 'yes'
      GROUP BY date_trunc('minute', trade_timestamp)
      ORDER BY bucket DESC
      LIMIT 720
    `,
    sql<Array<{ bucket: Date; volume: string; trade_count: number }>>`
      SELECT bucket, volume::text, trade_count
      FROM market_aggregates_1m
      WHERE market_id = ${id}
      ORDER BY bucket DESC
      LIMIT 720
    `,
    sql<
      Array<{
        id: string;
        wallet_address: string;
        wallet_metadata: Record<string, unknown> | null;
        side: "buy" | "sell";
        price: string;
        quantity: string;
        usd_value: string;
        outcome: string | null;
        trade_timestamp: Date;
      }>
    >`
      SELECT
        t.id,
        t.wallet_address,
        wp.metadata AS wallet_metadata,
        t.side::text AS side,
        t.price::text,
        t.quantity::text,
        t.usd_value::text,
        t.outcome,
        t.trade_timestamp
      FROM trades t
      LEFT JOIN wallet_profiles wp ON wp.wallet_address = t.wallet_address
      WHERE t.market_id = ${id}
      ORDER BY t.trade_timestamp DESC
      LIMIT 50
    `,
    sql<
      Array<{
        wallet_address: string;
        wallet_metadata: Record<string, unknown> | null;
        buy_volume_usd: string;
        sell_volume_usd: string;
        net_flow_usd: string;
        trade_count: string;
        last_trade_at: Date;
      }>
    >`
      SELECT
        t.wallet_address,
        wp.metadata AS wallet_metadata,
        COALESCE(SUM(t.usd_value) FILTER (WHERE t.side = 'buy'), 0)::text AS buy_volume_usd,
        COALESCE(SUM(t.usd_value) FILTER (WHERE t.side = 'sell'), 0)::text AS sell_volume_usd,
        (
          COALESCE(SUM(t.usd_value) FILTER (WHERE t.side = 'buy'), 0)
          - COALESCE(SUM(t.usd_value) FILTER (WHERE t.side = 'sell'), 0)
        )::text AS net_flow_usd,
        COUNT(*)::text AS trade_count,
        MAX(t.trade_timestamp) AS last_trade_at
      FROM trades t
      LEFT JOIN wallet_profiles wp ON wp.wallet_address = t.wallet_address
      WHERE t.market_id = ${id}
        AND t.trade_timestamp >= now() - interval '7 days'
      GROUP BY t.wallet_address, wp.metadata
      ORDER BY COUNT(*) DESC, ABS(
        COALESCE(SUM(t.usd_value) FILTER (WHERE t.side = 'buy'), 0)
        - COALESCE(SUM(t.usd_value) FILTER (WHERE t.side = 'sell'), 0)
      ) DESC
      LIMIT 20
    `,
    sql<
      Array<{
        id: string;
        anomaly_type: string;
        severity_score: string;
        confidence_score: string;
        summary: string;
        wallet_addresses: string[] | null;
        metadata: Record<string, unknown>;
        detected_at: Date;
      }>
    >`
      SELECT
        id,
        anomaly_type::text,
        severity_score::text,
        confidence_score::text,
        summary,
        wallet_addresses,
        metadata,
        detected_at
      FROM anomaly_events
      WHERE market_id = ${id}
      ORDER BY detected_at DESC
      LIMIT 30
    `
  ]);

  const sharedWalletAddresses = Array.from(
    new Set(anomalyRows.flatMap((row) => row.wallet_addresses ?? []))
  );
  const relatedThemes = inferNarrativeThemes(market.category, market.title, market.description);
  const primaryRelatedTheme = relatedThemes[0] ?? "geopolitical_escalation";
  const relatedMarketRows = await sql<RelatedMarketRow[]>`
    SELECT
      m.id,
      m.title,
      m.category,
      COUNT(DISTINCT ae.id)::text AS recent_signal_count,
      COALESCE(m.volume_24h, NULLIF(m.metadata->>'gamma_volume', '')::numeric)::text AS recent_volume,
      COUNT(DISTINCT shared_wallets.wallet_address)::text AS shared_wallet_count,
      MIN(ae.detected_at) AS first_activity_at,
      MAX(ae.detected_at) AS latest_activity_at
    FROM markets m
    LEFT JOIN anomaly_events ae
      ON ae.market_id = m.id
      AND ae.detected_at >= now() - interval '24 hours'
    LEFT JOIN LATERAL (
      SELECT unnest(ae.wallet_addresses) AS wallet_address
    ) shared_wallets ON shared_wallets.wallet_address = ANY(${sharedWalletAddresses}::text[])
    WHERE m.id <> ${id}
      AND m.is_active_universe = true
      AND (
        lower(m.category) = lower(${market.category})
        OR lower(m.title) LIKE ${`%${primaryRelatedTheme.split("_")[0]}%`}
      )
    GROUP BY m.id, m.title, m.category, m.volume_24h, m.metadata
    ORDER BY COUNT(DISTINCT ae.id) DESC,
      COUNT(DISTINCT shared_wallets.wallet_address) DESC,
      COALESCE(m.volume_24h, NULLIF(m.metadata->>'gamma_volume', '')::numeric, 0) DESC
    LIMIT 5
  `;

  const probabilityHistory = probabilityRows.reverse().map((row) => ({
    bucket: row.bucket.toISOString(),
    yesProbability: Number(row.yes_probability)
  }));
  const volumeHistory = volumeRows.reverse().map((row) => ({
    bucket: row.bucket.toISOString(),
    volume: Number(row.volume),
    tradeCount: row.trade_count
  }));
  const largeTradeThreshold = Math.max(1_000, Number(market.volume_24h ?? 0) * 0.02);
  const probabilityEvents: MarketTimelineItem[] = [];
  for (let index = 1; index < probabilityHistory.length; index += 1) {
    const previous = probabilityHistory[index - 1];
    const current = probabilityHistory[index];
    if (!previous || !current) continue;
    const delta = current.yesProbability - previous.yesProbability;
    if (Math.abs(delta) < 0.03) continue;
    probabilityEvents.push({
      id: `probability-${current.bucket}`,
      timestamp: current.bucket,
      eventType: "probability_move",
      direction: delta > 0 ? "YES up" : "YES down",
      walletAddress: null,
      walletArchetype: null,
      marketImpact: `${delta > 0 ? "+" : ""}${(delta * 100).toFixed(1)} pts`,
      explanation: `YES probability ${delta > 0 ? "rose" : "fell"} ${(
        Math.abs(delta) * 100
      ).toFixed(1)} percentage points versus the prior observed minute.`,
      severity: Math.abs(delta) >= 0.1 ? "high impact" : "meaningful",
      confidence: 70
    });
  }
  const averageVolume =
    volumeHistory.reduce((sum, point) => sum + point.volume, 0) / Math.max(1, volumeHistory.length);
  const volumeEvents = volumeHistory
    .filter((point) => point.volume > 0 && averageVolume > 0 && point.volume >= averageVolume * 2)
    .map(
      (point): MarketTimelineItem => ({
        id: `volume-${point.bucket}`,
        timestamp: point.bucket,
        eventType: "volume_spike",
        direction: null,
        walletAddress: null,
        walletArchetype: null,
        marketImpact: `${(point.volume / averageVolume).toFixed(1)}x baseline`,
        explanation: `Trading volume reached ${formatNumber(point.volume)} versus a recent baseline of ${formatNumber(
          averageVolume
        )}.`,
        severity: point.volume >= averageVolume * 4 ? "high impact" : "meaningful",
        confidence: 65
      })
    );
  const largeTradeEvents = tradeRows
    .filter((row) => Number(row.usd_value) >= largeTradeThreshold)
    .slice(0, 15)
    .map(
      (row): MarketTimelineItem => ({
        id: `trade-${row.id}`,
        timestamp: row.trade_timestamp.toISOString(),
        eventType: "large_trade",
        direction: `${row.outcome?.toUpperCase() ?? "unknown"} ${row.side}`,
        walletAddress: row.wallet_address,
        walletArchetype: walletArchetype(row.wallet_metadata),
        marketImpact: formatNumber(Number(row.usd_value)),
        explanation: `Large ${row.outcome ?? "outcome"} ${row.side} of ${formatNumber(
          Number(row.usd_value)
        )} printed at ${Math.round(Number(row.price) * 100)}%.`,
        severity: Number(row.usd_value) >= largeTradeThreshold * 3 ? "high impact" : "meaningful",
        confidence: 75
      })
    );
  const anomalyEvents = anomalyRows.map((row): MarketTimelineItem => {
    const signalKind = metadataString(row.metadata, "signal_kind");
    const volume =
      metadataNumber(row.metadata, "total_volume_usd") ??
      metadataNumber(row.metadata, "usd_value") ??
      metadataNumber(row.metadata, "max_trade_usd");
    const side = metadataString(row.metadata, "side");
    const outcome = metadataString(row.metadata, "outcome");
    return {
      id: `anomaly-${row.id}`,
      timestamp: row.detected_at.toISOString(),
      eventType: "wallet_flow_anomaly",
      direction: outcome ? `${outcome.toUpperCase()} ${side ?? "flow"}` : side,
      walletAddress: row.wallet_addresses?.[0] ?? null,
      walletArchetype: null,
      marketImpact: volume === null ? null : formatNumber(volume),
      explanation: `${anomalyTitle(row.anomaly_type, signalKind)}. ${row.summary}`,
      severity: severityLabel(Number(row.severity_score)),
      confidence: Number(row.confidence_score)
    };
  });
  const timeline = [...probabilityEvents, ...volumeEvents, ...largeTradeEvents, ...anomalyEvents]
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 40);
  const replaySummary = buildReplaySummary(timeline);
  const relatedMarkets = relatedMarketRows.map(
    (row): RelatedMarketNarrative => ({
      marketId: row.id,
      title: row.title,
      category: row.category,
      sharedTheme: primaryRelatedTheme,
      activityScore:
        Number(row.recent_signal_count) * 12 +
        Number(row.shared_wallet_count) * 18 +
        Math.min(25, Math.log10(Number(row.recent_volume ?? 0) + 1) * 4),
      explanation:
        Number(row.shared_wallet_count) > 0
          ? "Shared wallet participation and related market activity appear close to this theme."
          : "Category or theme overlap suggests nearby market attention."
    })
  );
  const narrative = buildMarketNarrative({
    market,
    probabilityHistory,
    volumeHistory,
    timeline,
    walletRows,
    anomalyRows,
    relatedMarkets
  });
  const crossMarket = buildCrossMarketIntelligence({
    market,
    theme: narrative.primaryTheme,
    timeline,
    relatedMarketRows,
    relatedMarkets,
    sharedWalletCount: sharedWalletAddresses.length
  });
  const regime = buildMarketRegime({
    market,
    probabilityHistory,
    volumeHistory,
    walletRows,
    anomalyRows,
    timeline,
    crossMarket
  });

  const data: MarketDetail = {
    market: {
      id: market.id,
      slug: market.slug,
      title: market.title,
      description: market.description,
      source: market.source,
      category: market.category,
      status: market.status,
      conditionId: market.condition_id,
      clobTokenIds: market.clob_token_ids,
      probability: market.yes_probability === null ? null : Number(market.yes_probability),
      yesProbability: market.yes_probability === null ? null : Number(market.yes_probability),
      volume24h: Number(market.volume_24h ?? 0),
      liquidity: market.liquidity === null ? null : Number(market.liquidity),
      isActiveUniverse: market.is_active_universe,
      qualityScore:
        market.market_quality_score === null ? null : Number(market.market_quality_score),
      universeTier: market.universe_tier,
      intelligenceWeightedScore:
        market.intelligence_weighted_score === null
          ? null
          : Number(market.intelligence_weighted_score),
      repricingVelocityScore:
        market.repricing_velocity_score === null ? null : Number(market.repricing_velocity_score),
      narrativeRelevanceScore:
        market.narrative_relevance_score === null ? null : Number(market.narrative_relevance_score),
      walletActivityScore:
        market.wallet_activity_score === null ? null : Number(market.wallet_activity_score),
      exclusionReason: market.exclusion_reason,
      universeRank: market.universe_rank,
      latestAggregateBucket: market.latest_aggregate_bucket?.toISOString() ?? null,
      resolutionDate: market.resolution_date?.toISOString() ?? null,
      updatedAt: market.updated_at.toISOString()
    },
    probabilityHistory,
    volumeHistory,
    recentTrades: tradeRows.map((row) => ({
      id: row.id,
      walletAddress: row.wallet_address,
      walletArchetype: walletArchetype(row.wallet_metadata),
      side: row.side,
      price: Number(row.price),
      quantity: Number(row.quantity),
      usdValue: Number(row.usd_value),
      outcome: row.outcome,
      tradeTimestamp: row.trade_timestamp.toISOString()
    })),
    walletFlows: walletRows.map((row) => ({
      walletAddress: row.wallet_address,
      walletArchetype: walletArchetype(row.wallet_metadata),
      buyVolumeUsd: Number(row.buy_volume_usd),
      sellVolumeUsd: Number(row.sell_volume_usd),
      netFlowUsd: Number(row.net_flow_usd),
      tradeCount: Number(row.trade_count),
      lastTradeAt: row.last_trade_at.toISOString()
    })),
    timeline,
    replaySummary,
    narrative,
    crossMarket,
    regime
  };

  return ok(data, requestId);
});

export const OPTIONS = () => new Response(null, { status: 204, headers: corsHeaders });
