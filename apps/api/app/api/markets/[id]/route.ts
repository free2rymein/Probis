import type { MarketDetail, MarketTimelineItem, WalletArchetype } from "@probis/types";
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

const metadataString = (metadata: Record<string, unknown> | null, key: string) => {
  const value = metadata?.[key];
  return typeof value === "string" ? value : null;
};

const metadataNumber = (metadata: Record<string, unknown> | null, key: string) => {
  const value = metadata?.[key];
  const parsed =
    typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
};

const walletArchetype = (metadata: Record<string, unknown> | null) => {
  const value = metadataString(metadata, "archetype");
  return value && archetypes.has(value as WalletArchetype) ? (value as WalletArchetype) : null;
};

const severityLabel = (score: number): MarketTimelineItem["severity"] => {
  if (score >= 70) return "high impact";
  if (score >= 45) return "meaningful";
  return "watchlist";
};

const anomalyTitle = (anomalyType: string, signalKind: string | null) => {
  if (signalKind === "large_concentrated_yes_buying") return "Large concentrated YES buying";
  if (signalKind === "high_conviction_accumulation") return "High-conviction accumulation";
  if (signalKind === "unusual_wallet_activity") return "Unusual wallet activity";
  if (signalKind === "synchronized_directional_flow") return "Synchronized directional flow";
  return anomalyType.replaceAll("_", " ");
};

const formatNumber = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1
  }).format(value);

const buildReplaySummary = (timeline: MarketTimelineItem[]): MarketDetail["replaySummary"] => {
  if (timeline.length === 0) {
    return {
      headline: "No replayable market intelligence yet.",
      sequence:
        "The market has not accumulated enough probability, volume, trade, or anomaly events.",
      walletFlowTiming: "No wallet-flow timing relationship is available.",
      activityState: "quiet"
    };
  }

  const chronological = [...timeline].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );
  const first = chronological[0];
  const firstProbability = chronological.find((item) => item.eventType === "probability_move");
  const firstWalletFlow = chronological.find(
    (item) => item.eventType === "wallet_flow_anomaly" || item.eventType === "large_trade"
  );
  const anomalyCount = timeline.filter((item) => item.eventType === "wallet_flow_anomaly").length;
  const concentratedCount = timeline.filter(
    (item) => item.eventType === "wallet_flow_anomaly" || item.eventType === "large_trade"
  ).length;
  const highImpactCount = timeline.filter((item) => item.severity === "high impact").length;

  let activityState: MarketDetail["replaySummary"]["activityState"] = "quiet";
  if (highImpactCount > 0 || anomalyCount >= 2) activityState = "unusual";
  else if (concentratedCount >= 3) activityState = "concentrated";
  else if (timeline.length >= 4) activityState = "elevated";

  let walletFlowTiming = "Wallet flow and probability movement have not overlapped clearly yet.";
  if (firstProbability && firstWalletFlow) {
    const probabilityTime = new Date(firstProbability.timestamp).getTime();
    const walletTime = new Date(firstWalletFlow.timestamp).getTime();
    walletFlowTiming =
      walletTime < probabilityTime
        ? "Wallet flow appeared before the first observed probability move; treat this as correlation, not proven causality."
        : walletTime > probabilityTime
          ? "Wallet flow appeared after the first observed probability move; this may reflect reaction rather than cause."
          : "Wallet flow and probability movement appeared in the same observed minute.";
  }

  return {
    headline: `${activityState[0]?.toUpperCase()}${activityState.slice(1)} recent market activity.`,
    sequence: `First replayable event: ${first?.explanation ?? "n/a"}`,
    walletFlowTiming,
    activityState
  };
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

  const [probabilityRows, volumeRows, tradeRows, walletRows, anomalyRows] = await Promise.all([
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
        wallet_metadata: Record<string, unknown> | null;
        side: "buy" | "sell";
        price: string;
        quantity: string;
        usd_value: string;
        outcome: string | null;
        trade_timestamp: Date;
      }>
    >`
      SELECT
        t.id,
        t.wallet_address,
        wp.metadata AS wallet_metadata,
        t.side::text AS side,
        t.price::text,
        t.quantity::text,
        t.usd_value::text,
        t.outcome,
        t.trade_timestamp
      FROM trades t
      LEFT JOIN wallet_profiles wp ON wp.wallet_address = t.wallet_address
      WHERE t.market_id = ${id}
      ORDER BY t.trade_timestamp DESC
      LIMIT 50
    `,
    sql<
      Array<{
        wallet_address: string;
        wallet_metadata: Record<string, unknown> | null;
        buy_volume_usd: string;
        sell_volume_usd: string;
        net_flow_usd: string;
        trade_count: string;
        last_trade_at: Date;
      }>
    >`
      SELECT
        t.wallet_address,
        wp.metadata AS wallet_metadata,
        COALESCE(SUM(t.usd_value) FILTER (WHERE t.side = 'buy'), 0)::text AS buy_volume_usd,
        COALESCE(SUM(t.usd_value) FILTER (WHERE t.side = 'sell'), 0)::text AS sell_volume_usd,
        (
          COALESCE(SUM(t.usd_value) FILTER (WHERE t.side = 'buy'), 0)
          - COALESCE(SUM(t.usd_value) FILTER (WHERE t.side = 'sell'), 0)
        )::text AS net_flow_usd,
        COUNT(*)::text AS trade_count,
        MAX(t.trade_timestamp) AS last_trade_at
      FROM trades t
      LEFT JOIN wallet_profiles wp ON wp.wallet_address = t.wallet_address
      WHERE t.market_id = ${id}
        AND t.trade_timestamp >= now() - interval '7 days'
      GROUP BY t.wallet_address, wp.metadata
      ORDER BY COUNT(*) DESC, ABS(
        COALESCE(SUM(t.usd_value) FILTER (WHERE t.side = 'buy'), 0)
        - COALESCE(SUM(t.usd_value) FILTER (WHERE t.side = 'sell'), 0)
      ) DESC
      LIMIT 20
    `,
    sql<
      Array<{
        id: string;
        anomaly_type: string;
        severity_score: string;
        confidence_score: string;
        summary: string;
        wallet_addresses: string[] | null;
        metadata: Record<string, unknown>;
        detected_at: Date;
      }>
    >`
      SELECT
        id,
        anomaly_type::text,
        severity_score::text,
        confidence_score::text,
        summary,
        wallet_addresses,
        metadata,
        detected_at
      FROM anomaly_events
      WHERE market_id = ${id}
      ORDER BY detected_at DESC
      LIMIT 30
    `
  ]);

  const probabilityHistory = probabilityRows.reverse().map((row) => ({
    bucket: row.bucket.toISOString(),
    yesProbability: Number(row.yes_probability)
  }));
  const volumeHistory = volumeRows.reverse().map((row) => ({
    bucket: row.bucket.toISOString(),
    volume: Number(row.volume),
    tradeCount: row.trade_count
  }));
  const largeTradeThreshold = Math.max(1_000, Number(market.volume_24h ?? 0) * 0.02);
  const probabilityEvents: MarketTimelineItem[] = [];
  for (let index = 1; index < probabilityHistory.length; index += 1) {
    const previous = probabilityHistory[index - 1];
    const current = probabilityHistory[index];
    if (!previous || !current) continue;
    const delta = current.yesProbability - previous.yesProbability;
    if (Math.abs(delta) < 0.03) continue;
    probabilityEvents.push({
      id: `probability-${current.bucket}`,
      timestamp: current.bucket,
      eventType: "probability_move",
      direction: delta > 0 ? "YES up" : "YES down",
      walletAddress: null,
      walletArchetype: null,
      marketImpact: `${delta > 0 ? "+" : ""}${(delta * 100).toFixed(1)} pts`,
      explanation: `YES probability ${delta > 0 ? "rose" : "fell"} ${(
        Math.abs(delta) * 100
      ).toFixed(1)} percentage points versus the prior observed minute.`,
      severity: Math.abs(delta) >= 0.1 ? "high impact" : "meaningful",
      confidence: 70
    });
  }
  const averageVolume =
    volumeHistory.reduce((sum, point) => sum + point.volume, 0) / Math.max(1, volumeHistory.length);
  const volumeEvents = volumeHistory
    .filter((point) => point.volume > 0 && averageVolume > 0 && point.volume >= averageVolume * 2)
    .map(
      (point): MarketTimelineItem => ({
        id: `volume-${point.bucket}`,
        timestamp: point.bucket,
        eventType: "volume_spike",
        direction: null,
        walletAddress: null,
        walletArchetype: null,
        marketImpact: `${(point.volume / averageVolume).toFixed(1)}x baseline`,
        explanation: `Trading volume reached ${formatNumber(point.volume)} versus a recent baseline of ${formatNumber(
          averageVolume
        )}.`,
        severity: point.volume >= averageVolume * 4 ? "high impact" : "meaningful",
        confidence: 65
      })
    );
  const largeTradeEvents = tradeRows
    .filter((row) => Number(row.usd_value) >= largeTradeThreshold)
    .slice(0, 15)
    .map(
      (row): MarketTimelineItem => ({
        id: `trade-${row.id}`,
        timestamp: row.trade_timestamp.toISOString(),
        eventType: "large_trade",
        direction: `${row.outcome?.toUpperCase() ?? "unknown"} ${row.side}`,
        walletAddress: row.wallet_address,
        walletArchetype: walletArchetype(row.wallet_metadata),
        marketImpact: formatNumber(Number(row.usd_value)),
        explanation: `Large ${row.outcome ?? "outcome"} ${row.side} of ${formatNumber(
          Number(row.usd_value)
        )} printed at ${Math.round(Number(row.price) * 100)}%.`,
        severity: Number(row.usd_value) >= largeTradeThreshold * 3 ? "high impact" : "meaningful",
        confidence: 75
      })
    );
  const anomalyEvents = anomalyRows.map((row): MarketTimelineItem => {
    const signalKind = metadataString(row.metadata, "signal_kind");
    const volume =
      metadataNumber(row.metadata, "total_volume_usd") ??
      metadataNumber(row.metadata, "usd_value") ??
      metadataNumber(row.metadata, "max_trade_usd");
    const side = metadataString(row.metadata, "side");
    const outcome = metadataString(row.metadata, "outcome");
    return {
      id: `anomaly-${row.id}`,
      timestamp: row.detected_at.toISOString(),
      eventType: "wallet_flow_anomaly",
      direction: outcome ? `${outcome.toUpperCase()} ${side ?? "flow"}` : side,
      walletAddress: row.wallet_addresses?.[0] ?? null,
      walletArchetype: null,
      marketImpact: volume === null ? null : formatNumber(volume),
      explanation: `${anomalyTitle(row.anomaly_type, signalKind)}. ${row.summary}`,
      severity: severityLabel(Number(row.severity_score)),
      confidence: Number(row.confidence_score)
    };
  });
  const timeline = [...probabilityEvents, ...volumeEvents, ...largeTradeEvents, ...anomalyEvents]
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 40);
  const replaySummary = buildReplaySummary(timeline);

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
    probabilityHistory,
    volumeHistory,
    recentTrades: tradeRows.map((row) => ({
      id: row.id,
      walletAddress: row.wallet_address,
      walletArchetype: walletArchetype(row.wallet_metadata),
      side: row.side,
      price: Number(row.price),
      quantity: Number(row.quantity),
      usdValue: Number(row.usd_value),
      outcome: row.outcome,
      tradeTimestamp: row.trade_timestamp.toISOString()
    })),
    walletFlows: walletRows.map((row) => ({
      walletAddress: row.wallet_address,
      walletArchetype: walletArchetype(row.wallet_metadata),
      buyVolumeUsd: Number(row.buy_volume_usd),
      sellVolumeUsd: Number(row.sell_volume_usd),
      netFlowUsd: Number(row.net_flow_usd),
      tradeCount: Number(row.trade_count),
      lastTradeAt: row.last_trade_at.toISOString()
    })),
    timeline,
    replaySummary
  };

  return ok(data, requestId);
});

export const OPTIONS = () => new Response(null, { status: 204, headers: corsHeaders });
