import type { EventAssociatedMarket, EventListItem, EventMarketPreview, VenueTag } from "@probis/types";

const numberOrNull = (value: string | number | null | undefined) => {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export type EventRow = {
  id: string;
  external_event_id: string;
  slug: string;
  title: string;
  description?: string | null;
  end_date: Date | null;
  updated_at: Date;
  volume: string | null;
  volume_24h: string | null;
  liquidity: string | null;
  open_interest: string | null;
  venue_id: string;
  venue_slug: string;
  venue_name: string;
  category_id: string | null;
  category_slug: string | null;
  category_name: string | null;
  tags: VenueTag[] | null;
  market_count: number;
  top_markets: EventMarketPreview[] | null;
  leader_outcome: EventMarketPreview | null;
  same_resolution_date: boolean;
};

export const eventFromRow = (row: EventRow): EventListItem => ({
  id: row.id,
  externalEventId: row.external_event_id,
  slug: row.slug,
  title: row.title,
  endDate: row.end_date?.toISOString() ?? null,
  updatedAt: row.updated_at.toISOString(),
  venue: {
    id: row.venue_id,
    slug: row.venue_slug,
    name: row.venue_name,
    createdAt: row.updated_at.toISOString()
  },
  primaryCategory:
    row.category_id && row.category_slug && row.category_name
      ? { id: row.category_id, slug: row.category_slug, name: row.category_name }
      : null,
  tags: row.tags ?? [],
  volume: numberOrNull(row.volume),
  volume24h: numberOrNull(row.volume_24h),
  liquidity: numberOrNull(row.liquidity),
  openInterest: numberOrNull(row.open_interest),
  marketCount: row.market_count,
  topMarkets: row.top_markets ?? [],
  leaderOutcome: row.leader_outcome ?? null,
  outcomeOrdering: row.same_resolution_date ? "probability" : "resolution_date"
});

export type EventCardBaseRow = Omit<EventRow, "top_markets" | "leader_outcome" | "same_resolution_date">;

export type EventCardPageRow = EventCardBaseRow & {
  page_rank: number | string;
  top_markets: EventMarketPreview[] | null;
  leader_outcome: EventMarketPreview | null;
  same_resolution_date: boolean;
};

export const eventCardPageFromRows = (rows: EventCardPageRow[]) => rows.map(eventFromRow);

export type AssociatedMarketRow = {
  id: string;
  title: string;
  end_date: Date | null;
  yes_probability: number | string | null;
  no_probability: number | string | null;
  volume: number | string | null;
  probability_change_24h: number | string | null;
};

export const associatedMarketFromRow = (row: AssociatedMarketRow): EventAssociatedMarket => ({
  id: row.id,
  title: row.title,
  endDate: row.end_date?.toISOString() ?? null,
  yesProbability: numberOrNull(row.yes_probability),
  noProbability: numberOrNull(row.no_probability),
  volume: numberOrNull(row.volume),
  probabilityChange24h: numberOrNull(row.probability_change_24h)
});
