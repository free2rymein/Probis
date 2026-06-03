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
  error: { code: string; message: string; details?: Record<string, unknown> };
  meta: ApiMeta;
};

export type ApiResponse<TData> = ApiSuccess<TData> | ApiError;

export type MarketStatus = "draft" | "open" | "paused" | "closed" | "resolved" | "archived";

export type Venue = { id: string; slug: string; name: string; createdAt: string };

export type Category = {
  id: string;
  venueId: string;
  venueSlug: string;
  slug: string;
  name: string;
  createdAt: string;
  marketCount: number;
  eventCount: number;
};

export type VenueTag = { id: string; slug: string; label: string; source: string };

export type MarketEvent = {
  id: string;
  externalEventId: string;
  slug: string;
  title: string;
};

export type MarketOutcome = {
  id: string;
  outcomeName: string;
  probability: number | null;
  volume: number;
  rank: number;
  updatedAt: string;
};

export type MarketMetrics = {
  probability: number | null;
  volume: number | null;
  liquidity: number | null;
  openInterest: number | null;
  snapshotTime: string | null;
};

export type MarketListItem = {
  id: string;
  venue: Venue;
  primaryCategory: Pick<Category, "id" | "slug" | "name"> | null;
  /** @deprecated Use primaryCategory. */
  category: Pick<Category, "id" | "slug" | "name"> | null;
  tags: VenueTag[];
  event: MarketEvent | null;
  externalMarketId: string;
  slug: string;
  title: string;
  description: string | null;
  status: MarketStatus;
  endDate: string | null;
  createdAt: string;
  updatedAt: string;
  outcomes: MarketOutcome[];
  latestMetrics: MarketMetrics;
};

export type MarketHistoryPoint = MarketMetrics & {
  id: string;
  marketId: string;
  snapshotTime: string;
};

export type EventMarketPreview = {
  id: string;
  title: string;
  probability: number | null;
};

export type EventListItem = {
  id: string;
  externalEventId: string;
  slug: string;
  title: string;
  venue: Venue;
  primaryCategory: Pick<Category, "id" | "slug" | "name"> | null;
  tags: VenueTag[];
  volume: number | null;
  volume24h: number | null;
  liquidity: number | null;
  openInterest: number | null;
  endDate: string | null;
  updatedAt: string;
  marketCount: number;
  topMarkets: EventMarketPreview[];
  leaderOutcome: EventMarketPreview | null;
  outcomeOrdering: "probability" | "resolution_date";
};

export type EventDetail = EventListItem & {
  description: string | null;
  markets: EventAssociatedMarket[];
};

export type EventAssociatedMarket = {
  id: string;
  title: string;
  endDate: string | null;
  yesProbability: number | null;
  noProbability: number | null;
  volume: number | null;
  probabilityChange24h: number | null;
};

export type PaginatedResponse<TItem> = {
  items: TItem[];
  pagination: { limit: number; offset: number; total: number; nextOffset: number | null };
};
