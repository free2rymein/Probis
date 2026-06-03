import type { Category } from "@probis/types";
import type postgres from "postgres";
import { explorerValidMarket } from "@/lib/explorer-market-filter";
import { explorerEventQualityFilter } from "@/lib/explorer-quality-filter";
import type { CategoriesQuery } from "@/lib/query";
import { elapsedMs } from "@/lib/timing";

type CategoryRow = {
  id: string;
  venue_id: string;
  venue_slug: string;
  slug: string;
  name: string;
  created_at: Date;
  event_count: number;
};

export type CategoriesQueryResult = {
  response: Category[];
  categoryQueryMs: number;
  transformationMs: number;
};

const categoryFromRow = (row: CategoryRow): Category => ({
  id: row.id,
  venueId: row.venue_id,
  venueSlug: row.venue_slug,
  slug: row.slug,
  name: row.name,
  createdAt: row.created_at.toISOString(),
  marketCount: row.event_count,
  eventCount: row.event_count
});

export const queryLegacyCategories = async (sql: postgres.Sql, query: CategoriesQuery): Promise<CategoriesQueryResult> => {
  const categoryQueryStartedAt = performance.now();
  const rows = await sql.unsafe<CategoryRow[]>(
    `
    select c.id, c.venue_id, v.slug as venue_slug, c.slug, c.name, c.created_at,
      count(e.id)::int as event_count
    from categories c join venues v on v.id = c.venue_id
    left join events e on e.primary_category_id = c.id
      and e.active = true and e.closed = false and e.archived = false
      and ${explorerEventQualityFilter("e")}
      and exists (
        select 1 from event_markets em
        join markets m on m.id = em.market_id
        where em.event_id = e.id
          and ${explorerValidMarket("m")}
      )
    where ($1::text is null or v.slug = $1)
      and c.slug <> 'uncategorized'
    group by c.id, v.slug
    order by c.name asc
    `,
    [query.venue ?? null]
  );
  const categoryQueryMs = elapsedMs(categoryQueryStartedAt);
  const transformationStartedAt = performance.now();
  return {
    response: rows.map(categoryFromRow),
    categoryQueryMs,
    transformationMs: elapsedMs(transformationStartedAt)
  };
};
