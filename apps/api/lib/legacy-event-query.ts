import type { EventListItem, PaginatedResponse } from "@probis/types";
import type postgres from "postgres";
import { eventCardPageFromRows, type EventCardPageRow } from "@/lib/event-serializer";
import { activeEventFilter, eventCardPageSelect } from "@/lib/event-query";
import type { EventsQuery } from "@/lib/query";
import { elapsedMs } from "@/lib/timing";

const orderBy = {
  trending: "e.volume_24h desc nulls last, e.volume desc nulls last, e.liquidity desc nulls last, e.open_interest desc nulls last, e.updated_at desc nulls last, e.id asc",
  volume: "e.volume desc nulls last, e.volume_24h desc nulls last, e.liquidity desc nulls last, e.id asc",
  "open-interest": "e.open_interest desc nulls last, e.volume desc nulls last, e.id asc",
  newest: "e.updated_at desc nulls last, e.id asc",
  "ending-soon": "e.end_date asc nulls last, e.id asc"
} as const;

export type EventsQueryResult = {
  response: PaginatedResponse<EventListItem>;
  countQueryMs: number;
  cardQueryMs: number;
  combinedQueryMs?: number;
  databaseMs: number;
  transformationMs: number;
  hydratedEventCount: number;
};

export const queryLegacyEvents = async (sql: postgres.Sql, query: EventsQuery): Promise<EventsQueryResult> => {
  const search = query.search ? `%${query.search}%` : null;
  const spamFilter = query.category
    ? "true"
    : `not exists (
        select 1 from event_tags spam_et
        join venue_tags spam_tag on spam_tag.id = spam_et.tag_id
        where spam_et.event_id = e.id and spam_tag.slug = 'hide-from-new'
      )`;
  const where = `
    ${activeEventFilter}
    and ($1::text is null or v.slug = $1)
    and ($2::text is null or c.slug = $2)
    and ($3::text is null or e.title ilike $3)
    and ${spamFilter}
  `;
  const params = [query.venue ?? null, query.category ?? null, search];
  const databaseStartedAt = performance.now();
  const countQueryStartedAt = performance.now();
  const countQuery = sql.unsafe<Array<{ total: number }>>(
    `select count(*)::int as total
     from events e
     join venues v on v.id = e.venue_id
     left join categories c on c.id = e.primary_category_id
     where ${where}`,
    params
  ).then((rows) => ({ rows, durationMs: elapsedMs(countQueryStartedAt) }));
  const cardQueryStartedAt = performance.now();
  const cardQuery = sql.unsafe<EventCardPageRow[]>(
    eventCardPageSelect({ where, orderBy: orderBy[query.sort] }),
    [...params, query.limit, query.offset]
  ).then((rows) => ({ rows, durationMs: elapsedMs(cardQueryStartedAt) }));
  const [
    { rows: countRows, durationMs: countQueryMs },
    { rows: cardRows, durationMs: cardQueryMs }
  ] = await Promise.all([countQuery, cardQuery]);
  const transformationStartedAt = performance.now();
  const total = countRows[0]?.total ?? 0;
  const response: PaginatedResponse<EventListItem> = {
    items: eventCardPageFromRows(cardRows),
    pagination: {
      limit: query.limit,
      offset: query.offset,
      total,
      nextOffset: query.offset + query.limit < total ? query.offset + query.limit : null
    }
  };
  return {
    response,
    countQueryMs,
    cardQueryMs,
    databaseMs: elapsedMs(databaseStartedAt),
    transformationMs: elapsedMs(transformationStartedAt),
    hydratedEventCount: cardRows.length
  };
};
