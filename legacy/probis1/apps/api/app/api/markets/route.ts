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
  yes_probability: string | null;
  volume_24h: string | null;
  liquidity: string | null;
  is_active_universe: boolean;
  market_quality_score: string | null;
  universe_tier: string | null;
  intelligence_weighted_score: string | null;
  repricing_velocity_score: string | null;
  narrative_relevance_score: string | null;
  wallet_activity_score: string | null;
  exclusion_reason: string | null;
  universe_rank: number | null;
  latest_aggregate_bucket: Date | null;
  updated_at: Date;
  total_count: string;
};

const orderClause = (sql: ReturnType<typeof getSql>, sort: string, direction: "asc" | "desc") => {
  const dir = direction === "asc" ? sql`ASC` : sql`DESC`;

  if (sort === "title") return sql`m.title ${dir}`;
  if (sort === "status") return sql`m.status ${dir}, m.updated_at DESC`;
  if (sort === "volume")
    return sql`COALESCE(m.volume_24h, NULLIF(m.metadata->>'gamma_volume', '')::numeric, volume_24h.value, 0) ${dir}, m.updated_at DESC`;
  if (sort === "probability") {
    return sql`yes_probability.value ${dir} NULLS LAST, m.updated_at DESC`;
  }
  if (sort === "quality") {
    return sql`COALESCE(m.intelligence_weighted_score, m.market_quality_score) ${dir} NULLS LAST, m.universe_rank ASC NULLS LAST`;
  }
  return sql`m.updated_at ${dir}`;
};

export const GET = withApiHandler(async (request, { requestId }) => {
  const query = marketListQuerySchema.parse(queryObject(request));
  const search = query.search ? `%${query.search}%` : null;
  const sql = getSql();

  const rows = await sql<MarketRow[]>`
    SELECT
      m.id,
      m.slug,
      m.title,
      m.source::text AS source,
      m.category,
      m.status::text AS status,
      CASE
        WHEN yes_probability.value >= 0 AND yes_probability.value <= 1 THEN yes_probability.value::text
        ELSE NULL
      END AS probability,
      CASE
        WHEN yes_probability.value >= 0 AND yes_probability.value <= 1 THEN yes_probability.value::text
        ELSE NULL
      END AS yes_probability,
      COALESCE(m.volume_24h, NULLIF(m.metadata->>'gamma_volume', '')::numeric, volume_24h.value)::text AS volume_24h,
      m.liquidity::text AS liquidity,
      m.is_active_universe,
      m.market_quality_score::text,
      m.universe_tier,
      m.intelligence_weighted_score::text,
      m.repricing_velocity_score::text,
      m.narrative_relevance_score::text,
      m.wallet_activity_score::text,
      CASE WHEN ${query.activeUniverse ?? null}::boolean IS NULL THEN m.exclusion_reason ELSE NULL END AS exclusion_reason,
      m.universe_rank,
      latest.bucket AS latest_aggregate_bucket,
      m.updated_at,
      COUNT(*) OVER()::text AS total_count
    FROM markets m
    LEFT JOIN LATERAL (
      SELECT a.close, a.bucket
      FROM market_aggregates_1m a
      WHERE a.market_id = m.id
      ORDER BY a.bucket DESC
      LIMIT 1
    ) latest ON true
    LEFT JOIN LATERAL (
      SELECT CASE
        WHEN m.metadata->>'updated_at' IS NULL
          OR (m.metadata->>'updated_at')::timestamptz >= now() - interval '30 days'
          THEN COALESCE(m.current_probability_yes, m.current_probability)
        ELSE NULL
      END AS value
    ) yes_probability ON true
    LEFT JOIN LATERAL (
      SELECT COALESCE(SUM(a.volume), 0) AS value
      FROM market_aggregates_1m a
      WHERE a.market_id = m.id
        AND a.bucket >= now() - interval '24 hours'
    ) volume_24h ON true
    WHERE
      (${search}::text IS NULL OR m.title ILIKE ${search} OR m.slug ILIKE ${search})
      AND (${query.status ?? null}::market_status IS NULL OR m.status = ${query.status ?? null}::market_status)
      AND (${query.source ?? null}::market_source IS NULL OR m.source = ${query.source ?? null}::market_source)
      AND (${query.category ?? null}::text IS NULL OR m.category = ${query.category ?? null})
      AND (${query.activeUniverse ?? null}::boolean IS NULL OR m.is_active_universe = ${query.activeUniverse ?? null})
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
      yesProbability: row.yes_probability === null ? null : Number(row.yes_probability),
      volume24h: Number(row.volume_24h ?? 0),
      liquidity: row.liquidity === null ? null : Number(row.liquidity),
      isActiveUniverse: row.is_active_universe,
      qualityScore: row.market_quality_score === null ? null : Number(row.market_quality_score),
      universeTier: row.universe_tier,
      intelligenceWeightedScore:
        row.intelligence_weighted_score === null ? null : Number(row.intelligence_weighted_score),
      repricingVelocityScore:
        row.repricing_velocity_score === null ? null : Number(row.repricing_velocity_score),
      narrativeRelevanceScore:
        row.narrative_relevance_score === null ? null : Number(row.narrative_relevance_score),
      walletActivityScore:
        row.wallet_activity_score === null ? null : Number(row.wallet_activity_score),
      exclusionReason: row.exclusion_reason,
      universeRank: row.universe_rank,
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
