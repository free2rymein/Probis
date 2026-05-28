import type { AnomalySignal, WalletDetail, WalletIntelligenceSummary } from "@probis/types";
import { getSql } from "@/lib/db";
import { withApiHandler } from "@/lib/handler";
import { corsHeaders, fail, ok } from "@/lib/responses";

type RouteContext = {
  params: Promise<{ address: string }> | { address: string };
};

const routeParams = async (routeContext: unknown) => {
  const params = (routeContext as RouteContext | undefined)?.params;
  return params ? await params : null;
};

export const GET = withApiHandler(async (_request, { requestId }, routeContext) => {
  const params = await routeParams(routeContext);
  const address = params?.address;

  if (!address) {
    return fail("VALIDATION_ERROR", "Wallet address is required.", requestId, { status: 400 });
  }

  const sql = getSql();
  const [profile] = await sql<
    Array<{
      wallet_address: string;
      first_seen_at: Date;
      last_seen_at: Date;
      total_volume_usd: string;
      total_trade_count: number;
      smart_money_score: string;
      conviction_score: string;
      influence_score: string;
      active_market_count: number;
      anomaly_trigger_count: number;
      last_active_at: Date;
      metadata: Record<string, unknown>;
    }>
  >`
    SELECT *
    FROM wallet_profiles
    WHERE wallet_address = ${address}
    LIMIT 1
  `;

  if (!profile) {
    return fail("NOT_FOUND", "Wallet profile not found.", requestId, { status: 404 });
  }

  const [markets, anomalies, dailyStats] = await Promise.all([
    sql<
      Array<{
        wallet_address: string;
        market_id: string;
        market_title: string;
        total_volume_usd: string;
        trade_count: number;
        net_position_estimate: string;
        last_trade_at: Date;
      }>
    >`
      SELECT
        wma.wallet_address,
        wma.market_id,
        m.title AS market_title,
        wma.total_volume_usd::text,
        wma.trade_count,
        wma.net_position_estimate::text,
        wma.last_trade_at
      FROM wallet_market_activity wma
      INNER JOIN markets m ON m.id = wma.market_id
      WHERE wma.wallet_address = ${address}
      ORDER BY wma.last_trade_at DESC
      LIMIT 20
    `,
    sql<
      Array<{
        id: string;
        market_id: string;
        market_title: string;
        anomaly_type: string;
        severity_score: string;
        confidence_score: string;
        summary: string;
        wallet_addresses: string[] | null;
        metadata: Record<string, unknown>;
        detected_at: Date;
        created_at: Date;
      }>
    >`
      SELECT
        ae.id,
        ae.market_id,
        m.title AS market_title,
        ae.anomaly_type::text,
        ae.severity_score::text,
        ae.confidence_score::text,
        ae.summary,
        ae.wallet_addresses,
        ae.metadata,
        ae.detected_at,
        ae.created_at
      FROM anomaly_events ae
      INNER JOIN markets m ON m.id = ae.market_id
      WHERE ae.wallet_addresses @> ARRAY[${address}]::text[]
      ORDER BY ae.detected_at DESC
      LIMIT 20
    `,
    sql<
      Array<{
        wallet_address: string;
        bucket_date: Date;
        total_volume_usd: string;
        trade_count: number;
        active_markets: number;
        anomaly_count: number;
      }>
    >`
      SELECT *
      FROM wallet_daily_stats
      WHERE wallet_address = ${address}
      ORDER BY bucket_date DESC
      LIMIT 30
    `
  ]);

  const profileData: WalletIntelligenceSummary = {
    walletAddress: profile.wallet_address,
    firstSeenAt: profile.first_seen_at.toISOString(),
    lastSeenAt: profile.last_seen_at.toISOString(),
    totalVolumeUsd: Number(profile.total_volume_usd),
    totalTradeCount: profile.total_trade_count,
    smartMoneyScore: Number(profile.smart_money_score),
    convictionScore: Number(profile.conviction_score),
    influenceScore: Number(profile.influence_score),
    activeMarketCount: profile.active_market_count,
    anomalyTriggerCount: profile.anomaly_trigger_count,
    lastActiveAt: profile.last_active_at.toISOString(),
    metadata: profile.metadata
  };

  const data: WalletDetail = {
    profile: profileData,
    recentMarkets: markets.map((row) => ({
      walletAddress: row.wallet_address,
      marketId: row.market_id,
      marketTitle: row.market_title,
      totalVolumeUsd: Number(row.total_volume_usd),
      tradeCount: row.trade_count,
      netPositionEstimate: Number(row.net_position_estimate),
      lastTradeAt: row.last_trade_at.toISOString()
    })),
    recentAnomalies: anomalies.map(
      (row): AnomalySignal => ({
        id: row.id,
        marketId: row.market_id,
        marketTitle: row.market_title,
        anomalyType: row.anomaly_type,
        severityScore: Number(row.severity_score),
        confidenceScore: Number(row.confidence_score),
        summary: row.summary,
        walletAddresses: row.wallet_addresses ?? [],
        metadata: row.metadata,
        detectedAt: row.detected_at.toISOString(),
        createdAt: row.created_at.toISOString()
      })
    ),
    dailyStats: dailyStats.map((row) => ({
      walletAddress: row.wallet_address,
      bucketDate: row.bucket_date.toISOString(),
      totalVolumeUsd: Number(row.total_volume_usd),
      tradeCount: row.trade_count,
      activeMarkets: row.active_markets,
      anomalyCount: row.anomaly_count
    }))
  };

  return ok(data, requestId);
});

export const OPTIONS = () => new Response(null, { status: 204, headers: corsHeaders });
