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
  volume24h: number;
  liquidity: number | null;
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

export type WalletMarketActivity = {
  walletAddress: string;
  marketId: string;
  marketTitle: string;
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

export type WalletActivityPoint = {
  walletAddress: string;
  totalVolumeUsd: number;
  tradeCount: number;
  activeMarkets: number;
  lastActiveAt: string;
};

export type WalletDetail = {
  profile: WalletIntelligenceSummary;
  recentMarkets: WalletMarketActivity[];
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
