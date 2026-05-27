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

export type MarketStatus = "open" | "closed" | "settled" | "paused";

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

export type Wallet = {
  address: string;
  label?: string;
  chain: string;
  riskScore: number;
  lastSeenAt: string;
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

export type TimelineEvent = {
  id: string;
  occurredAt: string;
  title: string;
  severity: Severity;
  entityType: "market" | "wallet" | "signal" | "system";
  entityId?: string;
};
