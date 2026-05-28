import { useQuery } from "@tanstack/react-query";
import type {
  AggregatePoint,
  AnomalySignal,
  DashboardMetrics,
  MarketListItem,
  PaginatedResponse,
  TimelineListItem
} from "@probis/types";
import { apiGet } from "./client";

export type MarketsQuery = {
  limit: number;
  offset: number;
  search?: string;
  status?: string;
  source?: string;
  category?: string;
  sort?: string;
  direction?: "asc" | "desc";
};

export type SignalsQuery = {
  limit: number;
  offset: number;
  anomalyType?: string;
  minSeverity?: number;
  lookbackHours?: number;
  sort?: "severity_score" | "detected_at";
  direction?: "asc" | "desc";
};

export const REFRESH_INTERVALS = {
  dashboard: 15_000,
  markets: 30_000,
  aggregates: 20_000,
  timeline: 20_000,
  signals: 20_000
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
