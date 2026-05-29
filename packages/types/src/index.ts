export type ApiMeta = {
  requestId: string;
  timestamp: string;
};

export type ApiSuccess<TData> = {
  ok: true;
  data: TData;
  meta: ApiMeta;
};

export type ApiError = {
  ok: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
  meta: ApiMeta;
};

export type ApiResponse<TData> = ApiSuccess<TData> | ApiError;

export type Severity = "neutral" | "low" | "medium" | "high" | "critical";

export type MarketStatus = "draft" | "open" | "paused" | "closed" | "settled" | "cancelled";

export type Market = {
  id: string;
  slug: string;
  title: string;
  venue: string;
  status: MarketStatus;
  probability: number;
  volumeUsd: number;
  liquidityUsd: number;
  updatedAt: string;
};

export type MarketListItem = {
  id: string;
  slug: string;
  title: string;
  source: string;
  category: string;
  status: MarketStatus;
  probability: number | null;
  yesProbability: number | null;
  volume24h: number;
  liquidity: number | null;
  isActiveUniverse: boolean;
  qualityScore: number | null;
  universeTier: string | null;
  intelligenceWeightedScore: number | null;
  repricingVelocityScore: number | null;
  narrativeRelevanceScore: number | null;
  walletActivityScore: number | null;
  exclusionReason: string | null;
  universeRank: number | null;
  latestAggregateBucket: string | null;
  updatedAt: string;
};

export type PaginatedResponse<TItem> = {
  items: TItem[];
  pagination: {
    limit: number;
    offset: number;
    total: number;
    nextOffset: number | null;
  };
};

export type DashboardMetrics = {
  trackedMarketCount: number;
  openMarketCount: number;
  activeIngestionCount: number;
  recentTradeThroughput1m: number;
  recentTradeThroughput5m: number;
  volume24h: number;
  activeUniverseCount: number;
  activeUniverseAvgLiquidity: number;
  activeUniverseAvgVolume24h: number;
  topMarketByQualityScore: string | null;
  topCategories: Array<{
    category: string;
    count: number;
  }>;
  tierDistribution: Array<{
    tier: string;
    count: number;
  }>;
  topRepricingMarkets: Array<{
    title: string;
    score: number;
  }>;
  topNarrativeMarkets: Array<{
    title: string;
    score: number;
  }>;
  aggregateMarketsUpdated5m: number;
  latestAggregateBucket: string | null;
  latestMarketUpdate: string | null;
  openSignalsCount: number;
  highSeveritySignalsCount: number;
  latestAnomalyTimestamp: string | null;
  activeWhalesCount: number;
  topSmartMoneyWallet: string | null;
  topSmartMoneyScore: number | null;
  recentWhaleAlertsCount: number;
  coordinatedActivityCount: number;
  recentTimelineEvents1h: number;
  ingestionHealth: "healthy" | "stale" | "idle";
};

export type AggregatePoint = {
  marketId: string;
  bucket: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  tradeCount: number;
};

export type MarketProbabilityPoint = {
  bucket: string;
  yesProbability: number;
};

export type MarketVolumePoint = {
  bucket: string;
  volume: number;
  tradeCount: number;
};

export type MarketRecentTrade = {
  id: string;
  walletAddress: string;
  walletArchetype: WalletArchetype | null;
  side: "buy" | "sell";
  price: number;
  quantity: number;
  usdValue: number;
  outcome: string | null;
  tradeTimestamp: string;
};

export type MarketWalletFlow = {
  walletAddress: string;
  walletArchetype: WalletArchetype | null;
  buyVolumeUsd: number;
  sellVolumeUsd: number;
  netFlowUsd: number;
  tradeCount: number;
  lastTradeAt: string;
};

export type MarketTimelineItem = {
  id: string;
  timestamp: string;
  eventType: "probability_move" | "volume_spike" | "large_trade" | "wallet_flow_anomaly";
  direction: string | null;
  walletAddress: string | null;
  walletArchetype: WalletArchetype | null;
  marketImpact: string | null;
  explanation: string;
  severity: "watchlist" | "meaningful" | "high impact";
  confidence: number | null;
};

export type MarketReplaySummary = {
  headline: string;
  sequence: string;
  walletFlowTiming: string;
  activityState: "quiet" | "elevated" | "concentrated" | "unusual";
};

export type MarketDetail = {
  market: MarketListItem & {
    description: string | null;
    conditionId: string | null;
    clobTokenIds: string[];
    resolutionDate: string | null;
  };
  probabilityHistory: MarketProbabilityPoint[];
  volumeHistory: MarketVolumePoint[];
  recentTrades: MarketRecentTrade[];
  walletFlows: MarketWalletFlow[];
  timeline: MarketTimelineItem[];
  replaySummary: MarketReplaySummary;
};

export type TimelineListItem = {
  id: string;
  marketId: string;
  eventType: string;
  eventTimestamp: string;
  payload: Record<string, unknown>;
  createdAt: string;
};

export type Wallet = {
  address: string;
  label?: string;
  chain: string;
  riskScore: number;
  lastSeenAt: string;
};

export type WalletIntelligenceSummary = {
  walletAddress: string;
  firstSeenAt: string;
  lastSeenAt: string;
  totalVolumeUsd: number;
  totalTradeCount: number;
  smartMoneyScore: number;
  convictionScore: number;
  influenceScore: number;
  activeMarketCount: number;
  anomalyTriggerCount: number;
  lastActiveAt: string;
  metadata: Record<string, unknown>;
};

export type WalletArchetype =
  | "whale"
  | "sniper"
  | "momentum_trader"
  | "high_frequency_scalper"
  | "concentrated_conviction_buyer"
  | "broad_diversified_trader"
  | "emerging_wallet"
  | "inactive_wallet"
  | "low_activity_wallet"
  | "directional_buyer"
  | "directional_seller";

export type WalletIntelligenceMetrics = {
  archetype: WalletArchetype | null;
  archetypeConfidence: "low confidence" | "medium confidence" | "high confidence" | null;
  archetypeReason: string | null;
  directionalBias: number | null;
  directionalBiasLabel: string | null;
  concentrationScore: number | null;
  marketConcentration: number | null;
  recentActivityScore: number | null;
  recent24hVolumeUsd: number | null;
  recent24hTradeCount: number | null;
  averageTradeUsd: number | null;
  maxTradeUsd: number | null;
  largeTradeCount: number | null;
  yesBuyVolumeUsd: number | null;
  noBuyVolumeUsd: number | null;
  buyVolumeUsd: number | null;
  sellVolumeUsd: number | null;
  avgEntryPrice: number | null;
  avgExitPrice: number | null;
  proxyRealizedPnlUsd: number | null;
  proxyWinRate: number | null;
  proxyPnlUsd: number | null;
  proxyPnlSampleCount: number | null;
  proxyPnlResolvedCount: number | null;
  proxyPerformanceConfidence: "low" | "medium" | "high" | null;
  entryTimingScore: number | null;
  entryTimingLabel: "early" | "neutral" | "late" | "poor timing" | "insufficient data" | null;
  entryTimingConfidence: "low" | "medium" | "high" | null;
  timingSampleCount: number | null;
  reliabilityScore: number | null;
  reliabilityConfidence: "low" | "medium" | "high" | null;
  repeatedDirectionalMarketCount: number | null;
  specializationTags: Array<"crypto" | "geopolitics" | "macro" | "politics" | "tech_ai">;
  coordinatedFlowParticipation: boolean;
};

export type WalletMarketActivity = {
  walletAddress: string;
  marketId: string;
  marketTitle: string;
  marketCategory: string | null;
  totalVolumeUsd: number;
  tradeCount: number;
  netPositionEstimate: number;
  lastTradeAt: string;
};

export type WalletDailyStat = {
  walletAddress: string;
  bucketDate: string;
  totalVolumeUsd: number;
  tradeCount: number;
  activeMarkets: number;
  anomalyCount: number;
};

export type WalletRecentTrade = {
  id: string;
  marketId: string;
  marketTitle: string;
  side: "buy" | "sell";
  outcome: string | null;
  price: number;
  quantity: number;
  usdValue: number;
  tradeTimestamp: string;
};

export type WalletActivityPoint = {
  walletAddress: string;
  totalVolumeUsd: number;
  tradeCount: number;
  activeMarkets: number;
  lastActiveAt: string;
};

export type WalletDetail = {
  profile: WalletIntelligenceSummary;
  metrics: WalletIntelligenceMetrics;
  recentMarkets: WalletMarketActivity[];
  recentTrades: WalletRecentTrade[];
  recentAnomalies: AnomalySignal[];
  dailyStats: WalletDailyStat[];
};

export type SignalKind =
  | "market_dislocation"
  | "wallet_accumulation"
  | "liquidity_shift"
  | "price_anomaly"
  | "news_correlation";

export type Signal = {
  id: string;
  kind: SignalKind;
  title: string;
  severity: Severity;
  confidence: number;
  observedAt: string;
  source: string;
};

export type AnomalySignal = {
  id: string;
  marketId: string;
  marketTitle: string;
  anomalyType: string;
  severityScore: number;
  confidenceScore: number;
  summary: string;
  walletAddresses: string[];
  metadata: Record<string, unknown>;
  detectedAt: string;
  createdAt: string;
};

export type TimelineEvent = {
  id: string;
  occurredAt: string;
  title: string;
  severity: Severity;
  entityType: "market" | "wallet" | "signal" | "system";
  entityId?: string;
};
