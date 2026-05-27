import type { MarketListItem, PaginatedResponse } from "@probis/types";
import { getSql } from "@/lib/db";
import { withApiHandler } from "@/lib/handler";
import { marketListQuerySchema, queryObject } from "@/lib/query";
import { corsHeaders, ok } from "@/lib/responses";

type MarketRow = {
  id: string;
  slug: string;
  title: string;
  source: string;
  category: string;
  status: MarketListItem["status"];
  probability: string | null;
  volume_24h: string | null;
  latest_aggregate_bucket: Date | null;
  updated_at: Date;
  total_count: string;
};

const orderClause = (sql: ReturnType<typeof getSql>, sort: string, direction: "asc" | "desc") => {
  const dir = direction === "asc" ? sql`ASC` : sql`DESC`;

  if (sort === "title") return sql`m.title ${dir}`;
  if (sort === "status") return sql`m.status ${dir}, m.updated_at DESC`;
  if (sort === "volume") return sql`COALESCE(rv.volume_24h, 0) ${dir}, m.updated_at DESC`;
  if (sort === "probability") return sql`latest.close ${dir} NULLS LAST, m.updated_at DESC`;
  return sql`m.updated_at ${dir}`;
};

export const GET = withApiHandler(async (request, { requestId }) => {
  const query = marketListQuerySchema.parse(queryObject(request));
  const search = query.search ? `%${query.search}%` : null;
  const sql = getSql();

  const rows = await sql<MarketRow[]>`
    WITH recent_volume AS (
      SELECT
        market_id,
        SUM(volume)::text AS volume_24h
      FROM market_aggregates_1m
      WHERE bucket >= now() - interval '24 hours'
      GROUP BY market_id
    ),
    latest AS (
      SELECT DISTINCT ON (market_id)
        market_id,
        close,
        bucket
      FROM market_aggregates_1m
      ORDER BY market_id, bucket DESC
    )
    SELECT
      m.id,
      m.slug,
      m.title,
      m.source::text AS source,
      m.category,
      m.status::text AS status,
      latest.close::text AS probability,
      rv.volume_24h,
      latest.bucket AS latest_aggregate_bucket,
      m.updated_at,
      COUNT(*) OVER()::text AS total_count
    FROM markets m
    LEFT JOIN recent_volume rv ON rv.market_id = m.id
    LEFT JOIN latest ON latest.market_id = m.id
    WHERE
      (${search}::text IS NULL OR m.title ILIKE ${search} OR m.slug ILIKE ${search})
      AND (${query.status ?? null}::market_status IS NULL OR m.status = ${query.status ?? null}::market_status)
      AND (${query.source ?? null}::market_source IS NULL OR m.source = ${query.source ?? null}::market_source)
      AND (${query.category ?? null}::text IS NULL OR m.category = ${query.category ?? null})
    ORDER BY ${orderClause(sql, query.sort, query.direction)}
    LIMIT ${query.limit}
    OFFSET ${query.offset}
  `;

  const total = Number(rows[0]?.total_count ?? 0);
  const data: PaginatedResponse<MarketListItem> = {
    items: rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      title: row.title,
      source: row.source,
      category: row.category,
      status: row.status,
      probability: row.probability === null ? null : Number(row.probability),
      volume24h: Number(row.volume_24h ?? 0),
      liquidity: null,
      latestAggregateBucket: row.latest_aggregate_bucket?.toISOString() ?? null,
      updatedAt: row.updated_at.toISOString()
    })),
    pagination: {
      limit: query.limit,
      offset: query.offset,
      total,
      nextOffset: query.offset + query.limit < total ? query.offset + query.limit : null
    }
  };

  return ok(data, requestId);
});

export const OPTIONS = () => new Response(null, { status: 204, headers: corsHeaders });
