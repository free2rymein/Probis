import type { Category } from "@probis/types";
import type postgres from "postgres";
import type { CategoriesQuery } from "@/lib/query";
import { elapsedMs } from "@/lib/timing";
import type { CategoriesQueryResult } from "@/lib/legacy-categories-query";

type CategoryRow = {
  id: string;
  venue_id: string;
  venue_slug: string;
  slug: string;
  name: string;
  created_at: Date;
  event_count: number;
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

export const queryExplorerCardCategories = async (sql: postgres.Sql, query: CategoriesQuery): Promise<CategoriesQueryResult> => {
  const categoryQueryStartedAt = performance.now();
  const rows = await sql.unsafe<CategoryRow[]>(
    `
    select c.id, c.venue_id, v.slug as venue_slug, c.slug, c.name, c.created_at,
      count(cards.event_id)::int as event_count
    from categories c
    join venues v on v.id = c.venue_id
    left join explorer_event_cards cards
      on cards.category_id = c.id
      and cards.is_explorer_visible = true
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
