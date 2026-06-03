import type { MarketListItem, MarketMetrics, MarketOutcome, MarketStatus, VenueTag } from "@probis/types";

const numberOrNull = (value: string | number | null | undefined) => {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export type MarketRow = {
  id: string;
  external_market_id: string;
  slug: string;
  title: string;
  description: string | null;
  status: MarketStatus;
  end_date: Date | null;
  created_at: Date;
  updated_at: Date;
  venue_id: string;
  venue_slug: string;
  venue_name: string;
  category_id: string | null;
  category_slug: string | null;
  category_name: string | null;
  tags: VenueTag[] | null;
  event_id: string | null;
  external_event_id: string | null;
  event_slug: string | null;
  event_title: string | null;
  outcomes: MarketOutcome[] | null;
  probability: string | null;
  volume: string | null;
  liquidity: string | null;
  open_interest: string | null;
  snapshot_time: Date | null;
};

export const metricsFromRow = (row: MarketRow): MarketMetrics => ({
  probability: numberOrNull(row.probability),
  volume: numberOrNull(row.volume),
  liquidity: numberOrNull(row.liquidity),
  openInterest: numberOrNull(row.open_interest),
  snapshotTime: row.snapshot_time?.toISOString() ?? null
});

export const marketFromRow = (row: MarketRow): MarketListItem => ({
  id: row.id,
  externalMarketId: row.external_market_id,
  slug: row.slug,
  title: row.title,
  description: row.description,
  status: row.status,
  endDate: row.end_date?.toISOString() ?? null,
  createdAt: row.created_at.toISOString(),
  updatedAt: row.updated_at.toISOString(),
  venue: {
    id: row.venue_id,
    slug: row.venue_slug,
    name: row.venue_name,
    createdAt: row.created_at.toISOString()
  },
  primaryCategory:
    row.category_id && row.category_slug && row.category_name
      ? { id: row.category_id, slug: row.category_slug, name: row.category_name }
      : null,
  category:
    row.category_id && row.category_slug && row.category_name
      ? { id: row.category_id, slug: row.category_slug, name: row.category_name }
      : null,
  tags: row.tags ?? [],
  event:
    row.event_id && row.external_event_id && row.event_slug && row.event_title
      ? {
          id: row.event_id,
          externalEventId: row.external_event_id,
          slug: row.event_slug,
          title: row.event_title
        }
      : null,
  outcomes: row.outcomes ?? [],
  latestMetrics: metricsFromRow(row)
});
