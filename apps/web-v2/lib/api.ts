import type { ApiResponse, Category, EventDetail, EventListItem, MarketHistoryPoint, MarketListItem, PaginatedResponse, Venue } from "@probis/types";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001";

const get = async <T>(path: string, signal?: AbortSignal): Promise<T> => {
  const response = await fetch(`${API_BASE_URL}${path}`, { cache: "no-store", signal });
  const payload = (await response.json()) as ApiResponse<T>;
  if (!response.ok || !payload.ok) throw new Error(payload.ok ? "Request failed" : payload.error.message);
  return payload.data;
};

export const explorerApi = {
  venues: () => get<Venue[]>("/api/venues"),
  categories: (venue?: string, signal?: AbortSignal) => get<Category[]>(`/api/categories${venue ? `?venue=${encodeURIComponent(venue)}` : ""}`, signal),
  events: (params: URLSearchParams, signal?: AbortSignal) => get<PaginatedResponse<EventListItem>>(`/api/events?${params.toString()}`, signal),
  event: (id: string) => get<EventDetail>(`/api/events/${encodeURIComponent(id)}`),
  markets: (params: URLSearchParams) => get<PaginatedResponse<MarketListItem>>(`/api/markets?${params.toString()}`),
  market: (id: string) => get<MarketListItem>(`/api/markets/${encodeURIComponent(id)}`),
  history: (id: string) => get<MarketHistoryPoint[]>(`/api/markets/${encodeURIComponent(id)}/history?limit=576`)
};
