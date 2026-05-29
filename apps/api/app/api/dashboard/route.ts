import type { DashboardMetrics } from "@probis/types";
import { getSql } from "@/lib/db";
import { withApiHandler } from "@/lib/handler";
import { corsHeaders, ok } from "@/lib/responses";

type DashboardRow = {
  tracked_market_count: string;
  open_market_count: string;
  active_ingestion_count: string;
  recent_trade_throughput_1m: string | null;
  recent_trade_throughput_5m: string | null;
  volume_24h: string | null;
  active_universe_count: string;
  active_universe_avg_liquidity: string | null;
  active_universe_avg_volume_24h: string | null;
  top_market_by_quality_score: string | null;
  top_categories: Array<{ category: string; count: number }> | null;
  tier_distribution: Array<{ tier: string; count: number }> | null;
  top_repricing_markets: Array<{ title: string; score: number }> | null;
  top_narrative_markets: Array<{ title: string; score: number }> | null;
  aggregate_markets_updated_5m: string;
  latest_aggregate_bucket: Date | null;
  latest_market_update: Date | null;
  open_signals_count: string;
  high_severity_signals_count: string;
  latest_anomaly_timestamp: Date | null;
  active_whales_count: string;
  top_smart_money_wallet: string | null;
  top_smart_money_score: string | null;
  recent_whale_alerts_count: string;
  coordinated_activity_count: string;
  recent_timeline_events_1h: string;
  cross_market_clusters: Array<{
    cluster: string;
    marketCount: number;
    signalCount: number;
  }> | null;
};

const healthFromBucket = (bucket: Date | null): DashboardMetrics["ingestionHealth"] => {
  if (!bucket) return "idle";
  const ageMs = Date.now() - bucket.getTime();
  return ageMs <= 5 * 60_000 ? "healthy" : "stale";
};

const parseTopCategories = (
  value: DashboardRow["top_categories"]
): DashboardMetrics["topCategories"] => {
  if (!value) return [];
  if (Array.isArray(value)) return value;

  return [];
};

const parseArray = <T>(value: T[] | null): T[] => {
  if (!value) return [];
  return Array.isArray(value) ? value : [];
};

export const GET = withApiHandler(async (_request, { requestId }) => {
  const sql = getSql();
  const [row] = await sql<DashboardRow[]>`
    WITH market_counts AS (
      SELECT
        COUNT(*)::text AS tracked_market_count,
        COUNT(*) FILTER (WHERE status = 'open')::text AS open_market_count,
        COUNT(DISTINCT source)::text AS active_ingestion_count
      FROM markets
    ),
    market_freshness AS (
      SELECT MAX(updated_at) AS latest_market_update
      FROM markets
    ),
    active_universe_stats AS (
      SELECT
        COUNT(*) FILTER (WHERE m.is_active_universe)::text AS active_universe_count,
        AVG(m.liquidity) FILTER (WHERE m.is_active_universe)::text AS active_universe_avg_liquidity,
        AVG(COALESCE(m.volume_24h, volume_24h.value)) FILTER (WHERE m.is_active_universe)::text AS active_universe_avg_volume_24h,
        (
          SELECT title
          FROM markets
          WHERE is_active_universe
          ORDER BY intelligence_weighted_score DESC NULLS LAST, universe_rank ASC NULLS LAST
          LIMIT 1
        ) AS top_market_by_quality_score,
        (
          SELECT json_agg(
            json_build_object('category', ranked.category, 'count', ranked.market_count)
            ORDER BY ranked.market_count DESC, ranked.category ASC
          )
          FROM (
            SELECT category, COUNT(*)::integer AS market_count
            FROM markets
            WHERE is_active_universe
            GROUP BY category
            ORDER BY market_count DESC, category ASC
            LIMIT 5
          ) ranked
        ) AS top_categories,
        (
          SELECT json_agg(
            json_build_object('tier', ranked.universe_tier, 'count', ranked.market_count)
            ORDER BY ranked.market_count DESC, ranked.universe_tier ASC
          )
          FROM (
            SELECT COALESCE(universe_tier, 'unassigned') AS universe_tier, COUNT(*)::integer AS market_count
            FROM markets
            WHERE is_active_universe
            GROUP BY COALESCE(universe_tier, 'unassigned')
          ) ranked
        ) AS tier_distribution,
        (
          SELECT json_agg(
            json_build_object('title', ranked.title, 'score', ranked.score)
            ORDER BY ranked.score DESC
          )
          FROM (
            SELECT title, repricing_velocity_score::float AS score
            FROM markets
            WHERE is_active_universe
              AND repricing_velocity_score IS NOT NULL
            ORDER BY repricing_velocity_score DESC
            LIMIT 5
          ) ranked
        ) AS top_repricing_markets,
        (
          SELECT json_agg(
            json_build_object('title', ranked.title, 'score', ranked.score)
            ORDER BY ranked.score DESC
          )
          FROM (
            SELECT title, narrative_relevance_score::float AS score
            FROM markets
            WHERE is_active_universe
              AND narrative_relevance_score IS NOT NULL
            ORDER BY narrative_relevance_score DESC
            LIMIT 5
          ) ranked
        ) AS top_narrative_markets
      FROM markets m
      LEFT JOIN LATERAL (
        SELECT COALESCE(SUM(a.volume), 0) AS value
        FROM market_aggregates_1m a
        WHERE a.market_id = m.id
          AND a.bucket >= now() - interval '24 hours'
      ) volume_24h ON true
    ),
    aggregate_stats AS (
      SELECT
        COALESCE(SUM(trade_count) FILTER (WHERE bucket >= now() - interval '1 minute'), 0)::text
          AS recent_trade_throughput_1m,
        COALESCE(SUM(trade_count) FILTER (WHERE bucket >= now() - interval '5 minutes'), 0)::text
          AS recent_trade_throughput_5m,
        COALESCE(SUM(volume), 0)::text AS volume_24h,
        COUNT(DISTINCT market_id) FILTER (WHERE bucket >= now() - interval '5 minutes')::text
          AS aggregate_markets_updated_5m,
        MAX(bucket) AS latest_aggregate_bucket
      FROM market_aggregates_1m
      WHERE bucket >= now() - interval '24 hours'
    ),
    timeline_stats AS (
      SELECT COUNT(*)::text AS recent_timeline_events_1h
      FROM market_timeline
      WHERE event_timestamp >= now() - interval '1 hour'
    ),
    anomaly_stats AS (
      SELECT
        COUNT(*)::text AS open_signals_count,
        COUNT(*) FILTER (WHERE severity_score >= 75)::text AS high_severity_signals_count,
        MAX(detected_at) AS latest_anomaly_timestamp
      FROM anomaly_events
      WHERE detected_at >= now() - interval '24 hours'
    ),
    wallet_stats AS (
      SELECT
        COUNT(*) FILTER (
          WHERE last_active_at >= now() - interval '24 hours'
            AND (influence_score >= 70 OR metadata->>'large_trade_count' IS NOT NULL)
        )::text AS active_whales_count,
        (
          SELECT wallet_address
          FROM wallet_profiles
          ORDER BY smart_money_score DESC, influence_score DESC
          LIMIT 1
        ) AS top_smart_money_wallet,
        (
          SELECT smart_money_score::text
          FROM wallet_profiles
          ORDER BY smart_money_score DESC, influence_score DESC
          LIMIT 1
        ) AS top_smart_money_score,
        (
          SELECT COUNT(*)::text
          FROM anomaly_events
          WHERE detected_at >= now() - interval '24 hours'
            AND anomaly_type IN ('whale_activity', 'repeat_whale_activity')
        ) AS recent_whale_alerts_count,
        (
          SELECT COUNT(*)::text
          FROM anomaly_events
          WHERE detected_at >= now() - interval '24 hours'
            AND anomaly_type = 'coordinated_wallet_activity'
        ) AS coordinated_activity_count
      FROM wallet_profiles
    ),
    cross_market_clusters AS (
      SELECT json_agg(
        json_build_object(
          'cluster', cluster,
          'marketCount', market_count,
          'signalCount', signal_count
        )
        ORDER BY signal_count DESC, market_count DESC, cluster ASC
      ) AS cross_market_clusters
      FROM (
        SELECT
          CASE
            WHEN lower(m.title || ' ' || m.category) ~ 'ai|openai|anthropic|nvidia|chip|semiconductor|regulation|antitrust' THEN 'AI / Regulation'
            WHEN lower(m.title || ' ' || m.category) ~ 'fed|fomc|rate cut|interest rate|cpi|inflation|treasury' THEN 'Monetary Policy'
            WHEN lower(m.title || ' ' || m.category) ~ 'election|president|senate|congress|poll|vote|primary|trump|biden|vance' THEN 'Elections'
            WHEN lower(m.title || ' ' || m.category) ~ 'tariff|trade war|export control|trade deal' THEN 'Trade War'
            WHEN lower(m.title || ' ' || m.category) ~ 'bitcoin|ethereum|crypto|etf|sec' THEN 'Crypto ETF'
            WHEN lower(m.title || ' ' || m.category) ~ 'oil|gas|energy|opec|brent|wti' THEN 'Energy Markets'
            WHEN lower(m.title || ' ' || m.category) ~ 'recession|gdp|unemployment|jobs|payroll' THEN 'Recession Risk'
            ELSE 'Conflict Escalation'
          END AS cluster,
          COUNT(DISTINCT m.id)::integer AS market_count,
          COUNT(DISTINCT ae.id)::integer AS signal_count
        FROM markets m
        LEFT JOIN anomaly_events ae
          ON ae.market_id = m.id
          AND ae.detected_at >= now() - interval '24 hours'
        WHERE m.is_active_universe = true
        GROUP BY cluster
        ORDER BY signal_count DESC, market_count DESC
        LIMIT 6
      ) ranked
    )
    SELECT *
    FROM market_counts, market_freshness, active_universe_stats, aggregate_stats, timeline_stats, anomaly_stats, wallet_stats, cross_market_clusters
  `;

  const latestBucket = row?.latest_aggregate_bucket ?? null;
  const data: DashboardMetrics = {
    trackedMarketCount: Number(row?.tracked_market_count ?? 0),
    openMarketCount: Number(row?.open_market_count ?? 0),
    activeIngestionCount: Number(row?.active_ingestion_count ?? 0),
    recentTradeThroughput1m: Number(row?.recent_trade_throughput_1m ?? 0),
    recentTradeThroughput5m: Number(row?.recent_trade_throughput_5m ?? 0),
    volume24h: Number(row?.volume_24h ?? 0),
    activeUniverseCount: Number(row?.active_universe_count ?? 0),
    activeUniverseAvgLiquidity: Number(row?.active_universe_avg_liquidity ?? 0),
    activeUniverseAvgVolume24h: Number(row?.active_universe_avg_volume_24h ?? 0),
    topMarketByQualityScore: row?.top_market_by_quality_score ?? null,
    topCategories: parseTopCategories(row?.top_categories ?? null),
    tierDistribution: parseArray(row?.tier_distribution ?? null),
    topRepricingMarkets: parseArray(row?.top_repricing_markets ?? null),
    topNarrativeMarkets: parseArray(row?.top_narrative_markets ?? null),
    aggregateMarketsUpdated5m: Number(row?.aggregate_markets_updated_5m ?? 0),
    latestAggregateBucket: latestBucket?.toISOString() ?? null,
    latestMarketUpdate: row?.latest_market_update?.toISOString() ?? null,
    openSignalsCount: Number(row?.open_signals_count ?? 0),
    highSeveritySignalsCount: Number(row?.high_severity_signals_count ?? 0),
    latestAnomalyTimestamp: row?.latest_anomaly_timestamp?.toISOString() ?? null,
    activeWhalesCount: Number(row?.active_whales_count ?? 0),
    topSmartMoneyWallet: row?.top_smart_money_wallet ?? null,
    topSmartMoneyScore:
      row?.top_smart_money_score === null || row?.top_smart_money_score === undefined
        ? null
        : Number(row.top_smart_money_score),
    recentWhaleAlertsCount: Number(row?.recent_whale_alerts_count ?? 0),
    coordinatedActivityCount: Number(row?.coordinated_activity_count ?? 0),
    recentTimelineEvents1h: Number(row?.recent_timeline_events_1h ?? 0),
    crossMarketClusters: parseArray(row?.cross_market_clusters ?? null),
    ingestionHealth: healthFromBucket(latestBucket)
  };

  return ok(data, requestId);
});

export const OPTIONS = () => new Response(null, { status: 204, headers: corsHeaders });
