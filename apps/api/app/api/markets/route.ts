import type { PaginatedResponse, MarketListItem } from "@probis/types";
import { getSql } from "@/lib/db";
import { withApiHandler } from "@/lib/handler";
import { marketFromRow, type MarketRow } from "@/lib/market-serializer";
import { marketSelect } from "@/lib/market-query";
import { marketsQuerySchema, queryObject } from "@/lib/query";
import { ok } from "@/lib/responses";
import { explorerValidMarket } from "@/lib/explorer-market-filter";

export const GET = withApiHandler(async (request, { requestId }) => {
  const query = marketsQuerySchema.parse(queryObject(request));
  const sql = getSql();
  const search = query.search ? `%${query.search}%` : null;
  const [count] = await sql.unsafe<Array<{ total: number }>>(
    `
    select count(*)::int as total
    from markets m join venues v on v.id = m.venue_id left join categories c on c.id = m.primary_category_id
    where ${explorerValidMarket("m")}
      and ($1::text is null or c.slug = $1)
      and ($2::text is null or v.slug = $2)
      and ($3::text is null or m.status = $3)
      and ($4::text is null or m.title ilike $4)
    `,
    [query.category ?? null, query.venue ?? null, query.status ?? null, search]
  );
  const rows = await sql.unsafe<MarketRow[]>(`${marketSelect}
    where ${explorerValidMarket("m")}
      and ($1::text is null or c.slug = $1)
      and ($2::text is null or v.slug = $2)
      and ($3::text is null or m.status = $3)
      and ($4::text is null or m.title ilike $4)
    order by m.updated_at desc
    limit $5 offset $6`, [query.category ?? null, query.venue ?? null, query.status ?? null, search, query.limit, query.offset]);
  const total = count?.total ?? 0;
  const response: PaginatedResponse<MarketListItem> = {
    items: rows.map(marketFromRow),
    pagination: { limit: query.limit, offset: query.offset, total, nextOffset: query.offset + query.limit < total ? query.offset + query.limit : null }
  };
  return ok(response, requestId);
});
