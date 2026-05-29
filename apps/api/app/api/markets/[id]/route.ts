import type { MarketDetail } from "@probis/types";
import { getSql } from "@/lib/db";
import { withApiHandler } from "@/lib/handler";
import { corsHeaders, fail, ok } from "@/lib/responses";

type RouteContext = {
  params: Promise<{ id: string }> | { id: string };
};

const routeParams = async (routeContext: unknown) => {
  const params = (routeContext as RouteContext | undefined)?.params;
  return params ? await params : null;
};

type MarketRow = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  source: string;
  category: string;
  status: MarketDetail["market"]["status"];
  condition_id: string | null;
  clob_token_ids: string[];
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
  resolution_date: Date | null;
  updated_at: Date;
};

export const GET = withApiHandler(async (_request, { requestId }, routeContext) => {
  const params = await routeParams(routeContext);
  const id = params?.id;

  if (!id) {
    return fail("VALIDATION_ERROR", "Market id is required.", requestId, { status: 400 });
  }

  const sql = getSql();
  const [market] = await sql<MarketRow[]>`
    SELECT
      m.id,
      m.slug,
      m.title,
      m.description,
      m.source::text AS source,
      m.category,
      m.status::text AS status,
      m.condition_id,
      m.clob_token_ids,
      COALESCE(m.current_probability_yes, m.current_probability)::text AS yes_probability,
      COALESCE(m.volume_24h, NULLIF(m.metadata->>'gamma_volume', '')::numeric, volume_24h.value)::text AS volume_24h,
      m.liquidity::text,
      m.is_active_universe,
      m.market_quality_score::text,
      m.universe_tier,
      m.intelligence_weighted_score::text,
      m.repricing_velocity_score::text,
      m.narrative_relevance_score::text,
      m.wallet_activity_score::text,
      m.exclusion_reason,
      m.universe_rank,
      latest.bucket AS latest_aggregate_bucket,
      m.resolution_date,
      m.updated_at
    FROM markets m
    LEFT JOIN LATERAL (
      SELECT a.bucket
      FROM market_aggregates_1m a
      WHERE a.market_id = m.id
      ORDER BY a.bucket DESC
      LIMIT 1
    ) latest ON true
    LEFT JOIN LATERAL (
      SELECT COALESCE(SUM(a.volume), 0) AS value
      FROM market_aggregates_1m a
      WHERE a.market_id = m.id
        AND a.bucket >= now() - interval '24 hours'
    ) volume_24h ON true
    WHERE m.id = ${id}
    LIMIT 1
  `;

  if (!market) {
    return fail("NOT_FOUND", "Market not found.", requestId, { status: 404 });
  }

  const [probabilityRows, volumeRows, tradeRows, walletRows] = await Promise.all([
    sql<Array<{ bucket: Date; yes_probability: string }>>`
      SELECT
        date_trunc('minute', trade_timestamp) AS bucket,
        AVG(price)::text AS yes_probability
      FROM trades
      WHERE market_id = ${id}
        AND lower(COALESCE(outcome, '')) = 'yes'
      GROUP BY date_trunc('minute', trade_timestamp)
      ORDER BY bucket DESC
      LIMIT 720
    `,
    sql<Array<{ bucket: Date; volume: string; trade_count: number }>>`
      SELECT bucket, volume::text, trade_count
      FROM market_aggregates_1m
      WHERE market_id = ${id}
      ORDER BY bucket DESC
      LIMIT 720
    `,
    sql<
      Array<{
        id: string;
        wallet_address: string;
        side: "buy" | "sell";
        price: string;
        quantity: string;
        usd_value: string;
        outcome: string | null;
        trade_timestamp: Date;
      }>
    >`
      SELECT id, wallet_address, side::text AS side, price::text, quantity::text, usd_value::text, outcome, trade_timestamp
      FROM trades
      WHERE market_id = ${id}
      ORDER BY trade_timestamp DESC
      LIMIT 50
    `,
    sql<
      Array<{
        wallet_address: string;
        buy_volume_usd: string;
        sell_volume_usd: string;
        net_flow_usd: string;
        trade_count: string;
        last_trade_at: Date;
      }>
    >`
      SELECT
        wallet_address,
        COALESCE(SUM(usd_value) FILTER (WHERE side = 'buy'), 0)::text AS buy_volume_usd,
        COALESCE(SUM(usd_value) FILTER (WHERE side = 'sell'), 0)::text AS sell_volume_usd,
        (
          COALESCE(SUM(usd_value) FILTER (WHERE side = 'buy'), 0)
          - COALESCE(SUM(usd_value) FILTER (WHERE side = 'sell'), 0)
        )::text AS net_flow_usd,
        COUNT(*)::text AS trade_count,
        MAX(trade_timestamp) AS last_trade_at
      FROM trades
      WHERE market_id = ${id}
        AND trade_timestamp >= now() - interval '7 days'
      GROUP BY wallet_address
      ORDER BY COUNT(*) DESC, ABS(
        COALESCE(SUM(usd_value) FILTER (WHERE side = 'buy'), 0)
        - COALESCE(SUM(usd_value) FILTER (WHERE side = 'sell'), 0)
      ) DESC
      LIMIT 20
    `
  ]);

  const data: MarketDetail = {
    market: {
      id: market.id,
      slug: market.slug,
      title: market.title,
      description: market.description,
      source: market.source,
      category: market.category,
      status: market.status,
      conditionId: market.condition_id,
      clobTokenIds: market.clob_token_ids,
      probability: market.yes_probability === null ? null : Number(market.yes_probability),
      yesProbability: market.yes_probability === null ? null : Number(market.yes_probability),
      volume24h: Number(market.volume_24h ?? 0),
      liquidity: market.liquidity === null ? null : Number(market.liquidity),
      isActiveUniverse: market.is_active_universe,
      qualityScore:
        market.market_quality_score === null ? null : Number(market.market_quality_score),
      universeTier: market.universe_tier,
      intelligenceWeightedScore:
        market.intelligence_weighted_score === null
          ? null
          : Number(market.intelligence_weighted_score),
      repricingVelocityScore:
        market.repricing_velocity_score === null ? null : Number(market.repricing_velocity_score),
      narrativeRelevanceScore:
        market.narrative_relevance_score === null ? null : Number(market.narrative_relevance_score),
      walletActivityScore:
        market.wallet_activity_score === null ? null : Number(market.wallet_activity_score),
      exclusionReason: market.exclusion_reason,
      universeRank: market.universe_rank,
      latestAggregateBucket: market.latest_aggregate_bucket?.toISOString() ?? null,
      resolutionDate: market.resolution_date?.toISOString() ?? null,
      updatedAt: market.updated_at.toISOString()
    },
    probabilityHistory: probabilityRows.reverse().map((row) => ({
      bucket: row.bucket.toISOString(),
      yesProbability: Number(row.yes_probability)
    })),
    volumeHistory: volumeRows.reverse().map((row) => ({
      bucket: row.bucket.toISOString(),
      volume: Number(row.volume),
      tradeCount: row.trade_count
    })),
    recentTrades: tradeRows.map((row) => ({
      id: row.id,
      walletAddress: row.wallet_address,
      side: row.side,
      price: Number(row.price),
      quantity: Number(row.quantity),
      usdValue: Number(row.usd_value),
      outcome: row.outcome,
      tradeTimestamp: row.trade_timestamp.toISOString()
    })),
    walletFlows: walletRows.map((row) => ({
      walletAddress: row.wallet_address,
      buyVolumeUsd: Number(row.buy_volume_usd),
      sellVolumeUsd: Number(row.sell_volume_usd),
      netFlowUsd: Number(row.net_flow_usd),
      tradeCount: Number(row.trade_count),
      lastTradeAt: row.last_trade_at.toISOString()
    }))
  };

  return ok(data, requestId);
});

export const OPTIONS = () => new Response(null, { status: 204, headers: corsHeaders });
