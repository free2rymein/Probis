import type { EventListItem, EventMarketPreview, PaginatedResponse, VenueTag } from "@probis/types";
import type postgres from "postgres";
import type { EventsQuery } from "@/lib/query";
import { elapsedMs } from "@/lib/timing";
import type { EventsQueryResult } from "@/lib/legacy-event-query";

const orderBy = {
  trending: "cards.volume_24h desc nulls last, cards.volume desc nulls last, cards.liquidity desc nulls last, cards.open_interest desc nulls last, cards.event_updated_at desc nulls last, cards.event_id asc",
  volume: "cards.volume desc nulls last, cards.volume_24h desc nulls last, cards.liquidity desc nulls last, cards.event_id asc",
  "open-interest": "cards.open_interest desc nulls last, cards.volume desc nulls last, cards.event_id asc",
  newest: "cards.event_updated_at desc nulls last, cards.event_id asc",
  "ending-soon": "cards.end_date asc nulls last, cards.event_id asc"
} as const;

type ExplorerCardRow = {
  event_id: string | null;
  external_event_id: string | null;
  venue_id: string | null;
  venue_slug: string | null;
  venue_name: string | null;
  event_slug: string | null;
  title: string | null;
  category_id: string | null;
  category_slug: string | null;
  category_name: string | null;
  tags: VenueTag[] | null;
  volume: string | null;
  volume_24h: string | null;
  liquidity: string | null;
  open_interest: string | null;
  end_date: Date | null;
  event_updated_at: Date | null;
  market_count: number | null;
  top_markets: EventMarketPreview[] | null;
  leader_outcome: EventMarketPreview | null;
  outcome_ordering: EventListItem["outcomeOrdering"];
  total: number;
};

export type ReadModelHealth = {
  usable: boolean;
  reason: string | null;
  cardCount: number;
  refreshGenerationCount: number;
  durationMs: number;
};

const numberOrNull = (value: string | number | null | undefined) => {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const eventFromReadModel = (row: ExplorerCardRow & {
  event_id: string;
  external_event_id: string;
  venue_id: string;
  venue_slug: string;
  venue_name: string;
  event_slug: string;
  title: string;
  event_updated_at: Date;
  market_count: number;
}): EventListItem => ({
  id: row.event_id,
  externalEventId: row.external_event_id,
  slug: row.event_slug,
  title: row.title,
  endDate: row.end_date?.toISOString() ?? null,
  updatedAt: row.event_updated_at.toISOString(),
  venue: {
    id: row.venue_id,
    slug: row.venue_slug,
    name: row.venue_name,
    createdAt: row.event_updated_at.toISOString()
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
  outcomeOrdering: row.outcome_ordering
});

const globalHealth = globalThis as typeof globalThis & {
  __probisExplorerCardHealth?: { expiresAt: number; value: ReadModelHealth };
};

const READ_MODEL_HEALTH_TTL_MS = 60_000;

export const inspectExplorerCardReadModel = async (sql: postgres.Sql): Promise<ReadModelHealth> => {
  const cached = globalHealth.__probisExplorerCardHealth;
  if (cached && cached.expiresAt > Date.now()) return { ...cached.value, durationMs: 0 };
  const startedAt = performance.now();
  const [health] = await sql<{ refresh_generation: string }[]>`
    select refresh_generation
    from explorer_event_cards
    limit 1
  `;
  const cardCount = health ? 1 : 0;
  const refreshGenerationCount = health?.refresh_generation ? 1 : 0;
  const value = {
    usable: cardCount > 0 && refreshGenerationCount > 0,
    reason: cardCount === 0
      ? "read_model_empty"
      : refreshGenerationCount === 0
        ? "read_model_missing_refresh_generation"
        : null,
    cardCount,
    refreshGenerationCount,
    durationMs: elapsedMs(startedAt)
  };
  if (value.usable) {
    globalHealth.__probisExplorerCardHealth = { expiresAt: Date.now() + READ_MODEL_HEALTH_TTL_MS, value };
  }
  return value;
};

const buildWhere = (query: EventsQuery) => {
  const clauses = ["cards.is_explorer_visible = true"];
  const params: string[] = [];
  const parameter = (value: string) => {
    params.push(value);
    return `$${params.length}`;
  };
  if (query.venue) clauses.push(`cards.venue_slug = ${parameter(query.venue)}`);
  if (query.category) clauses.push(`cards.category_slug = ${parameter(query.category)}`);
  if (query.search) clauses.push(`cards.search_text ilike ${parameter(`%${query.search}%`)}`);
  if (!query.category) clauses.push("cards.hidden_from_new = false");
  return { where: clauses.join("\n    and "), params };
};

export const queryExplorerCardReadModel = async (sql: postgres.Sql, query: EventsQuery): Promise<EventsQueryResult> => {
  const { where, params } = buildWhere(query);
  const databaseStartedAt = performance.now();
  const cardQueryStartedAt = performance.now();
  const limit = `$${params.length + 1}`;
  const offset = `$${params.length + 2}`;
  const cardRows = await sql.unsafe<ExplorerCardRow[]>(
    `with filtered as materialized (
       select
         cards.event_id,
         cards.volume_24h,
         cards.volume,
         cards.liquidity,
         cards.open_interest,
         cards.event_updated_at,
         cards.end_date
       from explorer_event_cards cards
       where ${where}
     ),
     page as (
       select filtered.event_id, row_number() over (order by ${orderBy[query.sort].replaceAll("cards.", "filtered.")}) as page_rank
       from filtered
       order by ${orderBy[query.sort].replaceAll("cards.", "filtered.")}
       limit ${limit} offset ${offset}
     ),
     total as (
       select count(*)::int as total from filtered
     )
     select cards.*, total.total
     from total
     left join page on true
     left join explorer_event_cards cards on cards.event_id = page.event_id
     order by page.page_rank`,
    [...params, query.limit, query.offset]
  );
  const cardQueryMs = elapsedMs(cardQueryStartedAt);
  const transformationStartedAt = performance.now();
  const total = cardRows[0]?.total ?? 0;
  const items = cardRows
    .filter((row): row is ExplorerCardRow & {
      event_id: string;
      external_event_id: string;
      venue_id: string;
      venue_slug: string;
      venue_name: string;
      event_slug: string;
      title: string;
      event_updated_at: Date;
      market_count: number;
    } => row.event_id !== null)
    .map(eventFromReadModel);
  const response: PaginatedResponse<EventListItem> = {
    items,
    pagination: {
      limit: query.limit,
      offset: query.offset,
      total,
      nextOffset: query.offset + query.limit < total ? query.offset + query.limit : null
    }
  };
  return {
    response,
    countQueryMs: cardQueryMs,
    cardQueryMs,
    combinedQueryMs: cardQueryMs,
    databaseMs: elapsedMs(databaseStartedAt),
    transformationMs: elapsedMs(transformationStartedAt),
    hydratedEventCount: items.length
  };
};
