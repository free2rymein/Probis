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
  aggregate_markets_updated_5m: string;
  latest_aggregate_bucket: Date | null;
  recent_timeline_events_1h: string;
};

const healthFromBucket = (bucket: Date | null): DashboardMetrics["ingestionHealth"] => {
  if (!bucket) return "idle";
  const ageMs = Date.now() - bucket.getTime();
  return ageMs <= 5 * 60_000 ? "healthy" : "stale";
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
    aggregate_stats AS (
      SELECT
        COALESCE(SUM(trade_count) FILTER (WHERE bucket >= now() - interval '1 minute'), 0)::text
          AS recent_trade_throughput_1m,
        COALESCE(SUM(trade_count) FILTER (WHERE bucket >= now() - interval '5 minutes'), 0)::text
          AS recent_trade_throughput_5m,
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
    )
    SELECT *
    FROM market_counts, aggregate_stats, timeline_stats
  `;

  const latestBucket = row?.latest_aggregate_bucket ?? null;
  const data: DashboardMetrics = {
    trackedMarketCount: Number(row?.tracked_market_count ?? 0),
    openMarketCount: Number(row?.open_market_count ?? 0),
    activeIngestionCount: Number(row?.active_ingestion_count ?? 0),
    recentTradeThroughput1m: Number(row?.recent_trade_throughput_1m ?? 0),
    recentTradeThroughput5m: Number(row?.recent_trade_throughput_5m ?? 0),
    aggregateMarketsUpdated5m: Number(row?.aggregate_markets_updated_5m ?? 0),
    latestAggregateBucket: latestBucket?.toISOString() ?? null,
    recentTimelineEvents1h: Number(row?.recent_timeline_events_1h ?? 0),
    ingestionHealth: healthFromBucket(latestBucket)
  };

  return ok(data, requestId);
});

export const OPTIONS = () => new Response(null, { status: 204, headers: corsHeaders });
