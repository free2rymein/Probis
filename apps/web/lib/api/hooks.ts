import { useQuery } from "@tanstack/react-query";
import type {
  AggregatePoint,
  AnomalySignal,
  DashboardMetrics,
  MarketDetail,
  MarketListItem,
  PaginatedResponse,
  TimelineListItem,
  WalletActivityPoint,
  WalletDetail,
  WalletIntelligenceSummary
} from "@probis/types";
import { apiGet } from "./client";

export type MarketsQuery = {
  limit: number;
  offset: number;
  search?: string;
  status?: string;
  source?: string;
  category?: string;
  activeUniverse?: boolean;
  sort?: string;
  direction?: "asc" | "desc";
};

export type SignalsQuery = {
  limit: number;
  offset: number;
  anomalyType?: string;
  confidence?: "low" | "medium" | "high" | "critical";
  lifecycle?: "emerging" | "active" | "fading" | "resolved";
  marketId?: string;
  minSeverity?: number;
  lookbackHours?: number;
  sort?: "priority" | "severity_score" | "detected_at";
  direction?: "asc" | "desc";
};

export type WalletsQuery = {
  limit: number;
  offset: number;
  search?: string;
  sort?: "smart_money_score" | "influence_score" | "total_volume_usd" | "last_active_at";
  direction?: "asc" | "desc";
};

export const REFRESH_INTERVALS = {
  dashboard: 15_000,
  markets: 30_000,
  aggregates: 20_000,
  timeline: 20_000,
  signals: 20_000,
  wallets: 60_000
} as const;

export function useDashboardMetrics() {
  return useQuery({
    queryKey: ["dashboard"],
    queryFn: ({ signal }) => apiGet<DashboardMetrics>("/api/dashboard", {}, signal),
    refetchInterval: REFRESH_INTERVALS.dashboard
  });
}

export function useMarkets(query: MarketsQuery) {
  return useQuery({
    queryKey: ["markets", query],
    queryFn: ({ signal }) =>
      apiGet<PaginatedResponse<MarketListItem>>("/api/markets", query, signal),
    placeholderData: (previous) => previous,
    refetchInterval: REFRESH_INTERVALS.markets
  });
}

export function useMarketDetail(marketId: string) {
  return useQuery({
    queryKey: ["market", marketId],
    queryFn: ({ signal }) => apiGet<MarketDetail>(`/api/markets/${marketId}`, {}, signal),
    enabled: Boolean(marketId),
    refetchInterval: REFRESH_INTERVALS.markets
  });
}

export function useAggregates(marketId: string | null, limit = 240) {
  return useQuery({
    queryKey: ["aggregates", marketId, limit],
    queryFn: ({ signal }) =>
      apiGet<AggregatePoint[]>("/api/aggregates", { marketId, limit }, signal),
    enabled: Boolean(marketId),
    refetchInterval: REFRESH_INTERVALS.aggregates
  });
}

export function useTimeline(limit = 20) {
  return useQuery({
    queryKey: ["timeline", limit],
    queryFn: ({ signal }) =>
      apiGet<PaginatedResponse<TimelineListItem>>("/api/timeline", { limit, offset: 0 }, signal),
    refetchInterval: REFRESH_INTERVALS.timeline
  });
}

export function useSignals(query: SignalsQuery) {
  return useQuery({
    queryKey: ["signals", query],
    queryFn: ({ signal }) =>
      apiGet<PaginatedResponse<AnomalySignal>>("/api/signals", query, signal),
    placeholderData: (previous) => previous,
    refetchInterval: REFRESH_INTERVALS.signals
  });
}

export function useWallets(query: WalletsQuery) {
  return useQuery({
    queryKey: ["wallets", query],
    queryFn: ({ signal }) =>
      apiGet<PaginatedResponse<WalletIntelligenceSummary>>("/api/wallets", query, signal),
    placeholderData: (previous) => previous,
    refetchInterval: REFRESH_INTERVALS.wallets
  });
}

export function useWalletActivity(limit = 10) {
  return useQuery({
    queryKey: ["wallet-activity", limit],
    queryFn: ({ signal }) =>
      apiGet<PaginatedResponse<WalletActivityPoint>>(
        "/api/wallets/activity",
        { limit, offset: 0 },
        signal
      ),
    refetchInterval: REFRESH_INTERVALS.wallets
  });
}

export function useWalletDetail(address: string) {
  return useQuery({
    queryKey: ["wallet", address],
    queryFn: ({ signal }) => apiGet<WalletDetail>(`/api/wallets/${address}`, {}, signal),
    enabled: Boolean(address),
    refetchInterval: REFRESH_INTERVALS.wallets
  });
}
