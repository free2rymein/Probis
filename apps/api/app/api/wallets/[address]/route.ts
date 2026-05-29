import type {
  AnomalySignal,
  WalletArchetype,
  WalletDetail,
  WalletIntelligenceMetrics,
  WalletIntelligenceSummary
} from "@probis/types";
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

const metadataNumber = (metadata: Record<string, unknown>, key: string) => {
  const value = metadata[key];
  const parsed =
    typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
};

const metadataString = (metadata: Record<string, unknown>, key: string) => {
  const value = metadata[key];
  return typeof value === "string" ? value : null;
};

const archetypes = new Set<WalletArchetype>([
  "whale",
  "sniper",
  "momentum_trader",
  "high_frequency_scalper",
  "concentrated_conviction_buyer",
  "broad_diversified_trader",
  "emerging_wallet",
  "inactive_wallet",
  "low_activity_wallet",
  "directional_buyer",
  "directional_seller"
]);

type ProfileMetricSource = {
  total_trade_count: number;
  total_volume_usd: string;
  active_market_count: number;
  last_active_at: Date;
  conviction_score: string;
  metadata: Record<string, unknown>;
};

const fallbackArchetype = (profile: ProfileMetricSource): WalletArchetype => {
  const volume = Number(profile.total_volume_usd);
  const conviction = Number(profile.conviction_score);
  if (profile.last_active_at.getTime() < Date.now() - 48 * 60 * 60_000) return "inactive_wallet";
  if (conviction >= 55 && profile.active_market_count <= 2) return "concentrated_conviction_buyer";
  if (profile.total_trade_count < 5 || volume < 1_000) return "low_activity_wallet";
  return "broad_diversified_trader";
};

const specializationTags = (metadata: Record<string, unknown>) => {
  const value = metadata.specialization_tags;
  if (!Array.isArray(value)) return [];
  const allowed = new Set(["crypto", "geopolitics", "macro", "politics", "tech_ai"]);
  return value
    .map(String)
    .filter((tag) => allowed.has(tag)) as WalletIntelligenceMetrics["specializationTags"];
};

const fallbackConfidence = (profile: ProfileMetricSource) => {
  const volume = Number(profile.total_volume_usd);
  if (profile.total_trade_count >= 20 && volume >= 5_000) return "high confidence";
  if (profile.total_trade_count >= 5 || volume >= 1_000) return "medium confidence";
  return "low confidence";
};

const confidenceValue = (value: string | null) =>
  value === "low" || value === "medium" || value === "high" ? value : null;

const timingLabelValue = (value: string | null) =>
  value === "early" ||
  value === "neutral" ||
  value === "late" ||
  value === "poor timing" ||
  value === "insufficient data"
    ? value
    : null;

const walletMetrics = (profile: ProfileMetricSource): WalletIntelligenceMetrics => {
  const metadata = profile.metadata;
  const archetype = metadataString(metadata, "archetype");
  const confidence = metadataString(metadata, "archetype_confidence");
  return {
    archetype:
      archetype && archetypes.has(archetype as WalletArchetype)
        ? (archetype as WalletArchetype)
        : fallbackArchetype(profile),
    archetypeConfidence:
      confidence === "low confidence" ||
      confidence === "medium confidence" ||
      confidence === "high confidence"
        ? confidence
        : fallbackConfidence(profile),
    archetypeReason:
      metadataString(metadata, "archetype_reason") ??
      "Classification is based on recent volume, trade count, concentration, and activity recency.",
    directionalBias: metadataNumber(metadata, "directional_bias"),
    directionalBiasLabel: metadataString(metadata, "directional_bias_label"),
    concentrationScore: metadataNumber(metadata, "concentration_score"),
    marketConcentration: metadataNumber(metadata, "market_concentration"),
    recentActivityScore: metadataNumber(metadata, "recent_activity_score"),
    recent24hVolumeUsd: metadataNumber(metadata, "recent_24h_volume_usd"),
    recent24hTradeCount: metadataNumber(metadata, "recent_24h_trade_count"),
    averageTradeUsd: metadataNumber(metadata, "average_trade_usd"),
    maxTradeUsd: metadataNumber(metadata, "max_trade_usd"),
    largeTradeCount: metadataNumber(metadata, "large_trade_count"),
    yesBuyVolumeUsd: metadataNumber(metadata, "yes_buy_volume_usd"),
    noBuyVolumeUsd: metadataNumber(metadata, "no_buy_volume_usd"),
    buyVolumeUsd: metadataNumber(metadata, "buy_volume_usd"),
    sellVolumeUsd: metadataNumber(metadata, "sell_volume_usd"),
    avgEntryPrice: metadataNumber(metadata, "avg_entry_price"),
    avgExitPrice: metadataNumber(metadata, "avg_exit_price"),
    proxyRealizedPnlUsd: metadataNumber(metadata, "proxy_realized_pnl_usd"),
    proxyWinRate: metadataNumber(metadata, "proxy_win_rate"),
    proxyPnlUsd:
      metadataNumber(metadata, "proxy_pnl_usd") ??
      metadataNumber(metadata, "proxy_realized_pnl_usd"),
    proxyPnlSampleCount: metadataNumber(metadata, "proxy_pnl_sample_count"),
    proxyPnlResolvedCount: metadataNumber(metadata, "proxy_pnl_resolved_count"),
    proxyPerformanceConfidence: confidenceValue(
      metadataString(metadata, "proxy_performance_confidence")
    ),
    entryTimingScore: metadataNumber(metadata, "entry_timing_score"),
    entryTimingLabel: timingLabelValue(metadataString(metadata, "entry_timing_label")),
    entryTimingConfidence: confidenceValue(metadataString(metadata, "entry_timing_confidence")),
    timingSampleCount: metadataNumber(metadata, "timing_sample_count"),
    reliabilityScore: metadataNumber(metadata, "reliability_score"),
    reliabilityConfidence: confidenceValue(metadataString(metadata, "reliability_confidence")),
    repeatedDirectionalMarketCount: metadataNumber(metadata, "repeated_directional_market_count"),
    specializationTags: specializationTags(metadata),
    coordinatedFlowParticipation: metadata.coordinated_flow_participation === true
  };
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

  const [markets, trades, anomalies, dailyStats] = await Promise.all([
    sql<
      Array<{
        wallet_address: string;
        market_id: string;
        market_title: string;
        market_category: string | null;
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
        m.category AS market_category,
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
        side: "buy" | "sell";
        outcome: string | null;
        price: string;
        quantity: string;
        usd_value: string;
        trade_timestamp: Date;
      }>
    >`
      SELECT
        t.id,
        t.market_id,
        m.title AS market_title,
        t.side,
        t.outcome,
        t.price::text,
        t.quantity::text,
        t.usd_value::text,
        t.trade_timestamp
      FROM trades t
      INNER JOIN markets m ON m.id = t.market_id
      WHERE t.wallet_address = ${address}
      ORDER BY t.trade_timestamp DESC
      LIMIT 75
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
    metrics: walletMetrics(profile),
    recentMarkets: markets.map((row) => ({
      walletAddress: row.wallet_address,
      marketId: row.market_id,
      marketTitle: row.market_title,
      marketCategory: row.market_category,
      totalVolumeUsd: Number(row.total_volume_usd),
      tradeCount: row.trade_count,
      netPositionEstimate: Number(row.net_position_estimate),
      lastTradeAt: row.last_trade_at.toISOString()
    })),
    recentTrades: trades.map((row) => ({
      id: row.id,
      marketId: row.market_id,
      marketTitle: row.market_title,
      side: row.side,
      outcome: row.outcome,
      price: Number(row.price),
      quantity: Number(row.quantity),
      usdValue: Number(row.usd_value),
      tradeTimestamp: row.trade_timestamp.toISOString()
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
