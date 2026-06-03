import { sql, type SQL } from "drizzle-orm";
import type { ProbisDatabase } from "@probis/database";
import type {
  CoordinatedActivityCandidate,
  SmartFlowCandidate,
  WalletDailyInput,
  WalletMarketInput,
  WalletProfileInput,
  WalletScores
} from "../types";
import { logger } from "../../utils/logger";
import { serializeJson } from "../../utils/serialization";

const rows = <T>(result: unknown): T[] => {
  if (Array.isArray(result)) return result as T[];
  if (result && typeof result === "object" && "rows" in result) {
    return (result as { rows: T[] }).rows;
  }
  return [];
};

const toDate = (value: Date | string) => (value instanceof Date ? value : new Date(value));
const toIso = (value: Date | string) => (value instanceof Date ? value.toISOString() : value);
const toDateOnly = (value: Date | string) => toIso(value).slice(0, 10);
const toNumber = (value: string | number | null) => Number(value ?? 0);
const invalidWalletSql = sql`
  wallet_address IS NULL
  OR wallet_address = ''
  OR wallet_address = '0x0000000000000000000000000000000000000000'
  OR wallet_address = '0x0000000000000000000000000000000000000001'
`;

const textArraySql = (values: string[]) => {
  if (values.length === 0) return sql`ARRAY[]::text[]`;
  return sql`ARRAY[${sql.join(
    values.map((value) => sql`${value}`),
    sql`, `
  )}]::text[]`;
};

const textInSql = (values: string[]) =>
  sql`(${sql.join(
    values.map((value) => sql`${value}`),
    sql`, `
  )})`;

const specializationTags = (categories: string[]) => {
  const text = categories.join(" ").toLowerCase();
  const tags = new Set<string>();
  if (text.includes("crypto") || text.includes("bitcoin") || text.includes("ethereum")) {
    tags.add("crypto");
  }
  if (text.includes("geopolitics") || text.includes("war") || text.includes("foreign")) {
    tags.add("geopolitics");
  }
  if (text.includes("macro") || text.includes("finance") || text.includes("rates")) {
    tags.add("macro");
  }
  if (text.includes("politics") || text.includes("election")) tags.add("politics");
  if (text.includes("tech") || text.includes("ai") || text.includes("chips")) tags.add("tech_ai");
  return [...tags];
};

export const createWalletIntelligenceRepository = (db: ProbisDatabase) => ({
  async getRecentTradeStats(since: Date) {
    const sinceIso = since.toISOString();
    const [summary] = rows<{
      recent_trades_count: string;
      unique_wallet_count: string;
      valid_wallet_count: string;
      skipped_invalid_wallet_count: string;
      total_volume_analyzed: string | null;
    }>(
      await db.execute(sql`
        SELECT
          COUNT(*)::text AS recent_trades_count,
          COUNT(DISTINCT wallet_address)::text AS unique_wallet_count,
          COUNT(DISTINCT wallet_address) FILTER (WHERE NOT (${invalidWalletSql}))::text
            AS valid_wallet_count,
          COUNT(*) FILTER (WHERE ${invalidWalletSql})::text AS skipped_invalid_wallet_count,
          COALESCE(SUM(usd_value::numeric), 0)::text AS total_volume_analyzed
        FROM trades
        WHERE trade_timestamp >= ${sinceIso}
      `)
    );

    const tableBreakdown = rows<{ table_name: string; trade_count: string }>(
      await db.execute(sql`
        SELECT tableoid::regclass::text AS table_name, COUNT(*)::text AS trade_count
        FROM trades
        WHERE trade_timestamp >= ${sinceIso}
        GROUP BY tableoid::regclass::text
        ORDER BY COUNT(*) DESC
      `)
    );

    return {
      recentTradesCount: Number(summary?.recent_trades_count ?? 0),
      uniqueWalletCount: Number(summary?.unique_wallet_count ?? 0),
      validWalletCount: Number(summary?.valid_wallet_count ?? 0),
      skippedInvalidWalletCount: Number(summary?.skipped_invalid_wallet_count ?? 0),
      totalVolumeAnalyzed: Number(summary?.total_volume_analyzed ?? 0),
      tableBreakdown: tableBreakdown.map((row) => ({
        tableName: row.table_name,
        tradeCount: Number(row.trade_count)
      }))
    };
  },

  async getRecentWalletProfiles(
    since: Date,
    largeTradeThresholdUsd: number,
    limit: number
  ): Promise<WalletProfileInput[]> {
    const sinceIso = since.toISOString();
    const result = await db.execute(sql`
      WITH recent_trades AS (
        SELECT
          t.wallet_address,
          t.market_id,
          t.usd_value::numeric AS usd_value,
          t.price::numeric AS price,
          t.side::text AS side,
          lower(COALESCE(t.outcome, '')) AS outcome,
          t.trade_timestamp,
          m.status::text AS market_status,
          m.category AS market_category,
          m.resolution_date,
          m.current_probability_yes::numeric AS current_probability_yes
        FROM trades t
        LEFT JOIN markets m ON m.id = t.market_id
        WHERE t.trade_timestamp >= ${sinceIso}
          AND t.wallet_address IS NOT NULL
          AND t.wallet_address != ''
          AND t.wallet_address != '0x0000000000000000000000000000000000000000'
          AND t.wallet_address != '0x0000000000000000000000000000000000000001'
      ),
      trade_marks AS (
        SELECT
          rt.*,
          COALESCE(mark_1h.price, mark_6h.price, mark_24h.price, rt.current_probability_yes) AS later_yes_probability,
          CASE
            WHEN rt.outcome = 'yes' THEN COALESCE(mark_1h.price, mark_6h.price, mark_24h.price, rt.current_probability_yes) - rt.price
            WHEN rt.outcome = 'no' THEN rt.price - COALESCE(mark_1h.price, mark_6h.price, mark_24h.price, rt.current_probability_yes)
            WHEN rt.side = 'sell' THEN rt.price - COALESCE(mark_1h.price, mark_6h.price, mark_24h.price, rt.current_probability_yes)
            ELSE NULL
          END AS timing_edge,
          CASE
            WHEN rt.side = 'buy' AND rt.outcome = 'yes' THEN
              (COALESCE(rt.current_probability_yes, rt.price) - rt.price) * NULLIF(rt.usd_value / NULLIF(rt.price, 0), 0)
            WHEN rt.side = 'buy' AND rt.outcome = 'no' THEN
              ((1 - COALESCE(rt.current_probability_yes, rt.price)) - rt.price) * NULLIF(rt.usd_value / NULLIF(rt.price, 0), 0)
            WHEN rt.side = 'sell' THEN
              (rt.price - COALESCE(rt.current_probability_yes, rt.price)) * NULLIF(rt.usd_value / NULLIF(rt.price, 0), 0)
            ELSE 0
          END AS proxy_pnl_usd
        FROM recent_trades rt
        LEFT JOIN LATERAL (
          SELECT t2.price::numeric AS price
          FROM trades t2
          WHERE t2.market_id = rt.market_id
            AND lower(COALESCE(t2.outcome, '')) = 'yes'
            AND t2.trade_timestamp > rt.trade_timestamp
            AND t2.trade_timestamp <= rt.trade_timestamp + interval '1 hour'
          ORDER BY t2.trade_timestamp DESC
          LIMIT 1
        ) mark_1h ON true
        LEFT JOIN LATERAL (
          SELECT t2.price::numeric AS price
          FROM trades t2
          WHERE t2.market_id = rt.market_id
            AND lower(COALESCE(t2.outcome, '')) = 'yes'
            AND t2.trade_timestamp > rt.trade_timestamp
            AND t2.trade_timestamp <= rt.trade_timestamp + interval '6 hours'
          ORDER BY t2.trade_timestamp DESC
          LIMIT 1
        ) mark_6h ON mark_1h.price IS NULL
        LEFT JOIN LATERAL (
          SELECT t2.price::numeric AS price
          FROM trades t2
          WHERE t2.market_id = rt.market_id
            AND lower(COALESCE(t2.outcome, '')) = 'yes'
            AND t2.trade_timestamp > rt.trade_timestamp
            AND t2.trade_timestamp <= rt.trade_timestamp + interval '24 hours'
          ORDER BY t2.trade_timestamp DESC
          LIMIT 1
        ) mark_24h ON mark_1h.price IS NULL AND mark_6h.price IS NULL
      ),
      wallet_market AS (
        SELECT
          wallet_address,
          market_id,
          SUM(usd_value) AS market_volume,
          SUM(usd_value) FILTER (WHERE side = 'buy') AS buy_volume_usd,
          SUM(usd_value) FILTER (WHERE side = 'sell') AS sell_volume_usd,
          SUM(usd_value) FILTER (WHERE side = 'buy' AND outcome = 'yes') AS yes_buy_volume_usd,
          SUM(usd_value) FILTER (WHERE side = 'buy' AND outcome = 'no') AS no_buy_volume_usd,
          AVG(price) FILTER (WHERE side = 'buy') AS avg_entry_price,
          AVG(price) FILTER (WHERE side = 'sell') AS avg_exit_price,
          BOOL_OR(market_status = 'settled' OR resolution_date <= now()) AS has_resolution_proxy,
          CASE
            WHEN BOOL_OR(market_status = 'settled' OR resolution_date <= now()) THEN
              CASE
                WHEN COALESCE(SUM(usd_value) FILTER (WHERE side = 'buy' AND outcome = 'yes'), 0)
                  >= COALESCE(SUM(usd_value) FILTER (WHERE side = 'buy' AND outcome = 'no'), 0)
                  AND COALESCE(AVG(price) FILTER (WHERE side = 'buy' AND outcome = 'yes'), 1)
                    < COALESCE(MAX(current_probability_yes), 0)
                  THEN 1
                WHEN COALESCE(SUM(usd_value) FILTER (WHERE side = 'buy' AND outcome = 'no'), 0)
                  > COALESCE(SUM(usd_value) FILTER (WHERE side = 'buy' AND outcome = 'yes'), 0)
                  AND COALESCE(AVG(price) FILTER (WHERE side = 'buy' AND outcome = 'no'), 1)
                    < 1 - COALESCE(MAX(current_probability_yes), 1)
                  THEN 1
                ELSE 0
              END
            ELSE 0
          END AS profitable_market_proxy
        FROM trade_marks
        GROUP BY wallet_address, market_id
      ),
      wallet_performance AS (
        SELECT
          wallet_address,
          COALESCE(SUM(proxy_pnl_usd), 0) AS proxy_pnl_usd,
          COUNT(*) FILTER (WHERE later_yes_probability IS NOT NULL)::int AS proxy_pnl_sample_count,
          COUNT(*) FILTER (WHERE market_status = 'settled' OR resolution_date <= now())::int AS proxy_pnl_resolved_count,
          COUNT(*) FILTER (WHERE timing_edge IS NOT NULL)::int AS timing_sample_count,
          COUNT(*) FILTER (WHERE timing_edge >= 0.03)::int AS favorable_timing_count,
          COUNT(*) FILTER (WHERE timing_edge <= -0.03)::int AS poor_timing_count
        FROM trade_marks
        GROUP BY wallet_address
      ),
      repeated_directional AS (
        SELECT
          wallet_address,
          COUNT(*)::int AS repeated_directional_market_count
        FROM (
          SELECT wallet_address, market_id, side, outcome
          FROM recent_trades
          GROUP BY wallet_address, market_id, side, outcome
          HAVING COUNT(*) >= 2
        ) repeated
        GROUP BY wallet_address
      ),
      wallet_market_rollup AS (
        SELECT
          wallet_address,
          COUNT(*)::int AS active_market_count,
          MAX(market_volume) AS largest_market_volume,
          COALESCE(SUM(buy_volume_usd), 0) AS buy_volume_usd,
          COALESCE(SUM(sell_volume_usd), 0) AS sell_volume_usd,
          COALESCE(SUM(yes_buy_volume_usd), 0) AS yes_buy_volume_usd,
          COALESCE(SUM(no_buy_volume_usd), 0) AS no_buy_volume_usd,
          COALESCE(AVG(avg_entry_price), 0) AS avg_entry_price,
          COALESCE(AVG(avg_exit_price), 0) AS avg_exit_price,
          ARRAY_AGG(DISTINCT market_category) FILTER (WHERE market_category IS NOT NULL)
            AS market_categories,
          COUNT(*) FILTER (WHERE has_resolution_proxy)::int AS resolved_market_count,
          COALESCE(SUM(profitable_market_proxy), 0)::int AS profitable_market_proxy_count
        FROM wallet_market
        GROUP BY wallet_address
      ),
      wallet_anomalies AS (
        SELECT
          unnest(wallet_addresses) AS wallet_address,
          COUNT(*)::int AS anomaly_trigger_count,
          COUNT(DISTINCT market_id)::int AS high_signal_market_count,
          BOOL_OR(
            anomaly_type::text = 'coordinated_wallet_activity'
            OR metadata->>'signal_kind' = 'synchronized_directional_flow'
          ) AS coordinated_flow_participation
        FROM anomaly_events
        WHERE detected_at >= ${sinceIso}
          AND array_length(wallet_addresses, 1) > 0
        GROUP BY 1
      )
      SELECT
        rt.wallet_address,
        MIN(rt.trade_timestamp) AS first_seen_at,
        MAX(rt.trade_timestamp) AS last_seen_at,
        SUM(rt.usd_value)::text AS total_volume_usd,
        COUNT(*)::int AS total_trade_count,
        COALESCE(wmr.active_market_count, 0)::int AS active_market_count,
        COUNT(*) FILTER (WHERE rt.usd_value >= ${largeTradeThresholdUsd})::int AS large_trade_count,
        AVG(rt.usd_value)::text AS average_trade_usd,
        MAX(rt.usd_value)::text AS max_trade_usd,
        COALESCE(SUM(rt.usd_value) FILTER (WHERE rt.trade_timestamp >= now() - interval '24 hours'), 0)::text
          AS recent_24h_volume_usd,
        COUNT(*) FILTER (WHERE rt.trade_timestamp >= now() - interval '24 hours')::int
          AS recent_24h_trade_count,
        COALESCE(wa.anomaly_trigger_count, 0)::int AS anomaly_trigger_count,
        COALESCE(wa.high_signal_market_count, 0)::int AS high_signal_market_count,
        (wmr.largest_market_volume / NULLIF(SUM(rt.usd_value), 0))::text AS market_concentration,
        COALESCE(wmr.yes_buy_volume_usd, 0)::text AS yes_buy_volume_usd,
        COALESCE(wmr.no_buy_volume_usd, 0)::text AS no_buy_volume_usd,
        COALESCE(wmr.buy_volume_usd, 0)::text AS buy_volume_usd,
        COALESCE(wmr.sell_volume_usd, 0)::text AS sell_volume_usd,
        COALESCE(wmr.avg_entry_price, 0)::text AS avg_entry_price,
        COALESCE(wmr.avg_exit_price, 0)::text AS avg_exit_price,
        COALESCE(wmr.market_categories, ARRAY[]::text[]) AS market_categories,
        COALESCE(wmr.profitable_market_proxy_count, 0)::int AS profitable_market_proxy_count,
        COALESCE(wmr.resolved_market_count, 0)::int AS resolved_market_count,
        COALESCE(wa.coordinated_flow_participation, false) AS coordinated_flow_participation,
        COALESCE(wp.proxy_pnl_usd, 0)::text AS proxy_pnl_usd,
        COALESCE(wp.proxy_pnl_sample_count, 0)::int AS proxy_pnl_sample_count,
        COALESCE(wp.proxy_pnl_resolved_count, 0)::int AS proxy_pnl_resolved_count,
        COALESCE(wp.timing_sample_count, 0)::int AS timing_sample_count,
        COALESCE(wp.favorable_timing_count, 0)::int AS favorable_timing_count,
        COALESCE(wp.poor_timing_count, 0)::int AS poor_timing_count,
        COALESCE(rd.repeated_directional_market_count, 0)::int AS repeated_directional_market_count
      FROM recent_trades rt
      LEFT JOIN wallet_market_rollup wmr ON wmr.wallet_address = rt.wallet_address
      LEFT JOIN wallet_anomalies wa ON wa.wallet_address = rt.wallet_address
      LEFT JOIN wallet_performance wp ON wp.wallet_address = rt.wallet_address
      LEFT JOIN repeated_directional rd ON rd.wallet_address = rt.wallet_address
      GROUP BY rt.wallet_address, wmr.active_market_count, wmr.largest_market_volume,
        wmr.yes_buy_volume_usd, wmr.no_buy_volume_usd, wmr.buy_volume_usd, wmr.sell_volume_usd,
        wmr.avg_entry_price, wmr.avg_exit_price, wmr.market_categories, wmr.profitable_market_proxy_count,
        wmr.resolved_market_count, wa.anomaly_trigger_count, wa.high_signal_market_count,
        wa.coordinated_flow_participation, wp.proxy_pnl_usd, wp.proxy_pnl_sample_count,
        wp.proxy_pnl_resolved_count, wp.timing_sample_count, wp.favorable_timing_count,
        wp.poor_timing_count, rd.repeated_directional_market_count
      HAVING SUM(rt.usd_value) > 0
        AND COUNT(*) >= 1
      ORDER BY SUM(rt.usd_value) DESC
      LIMIT ${limit}
    `);

    return rows<{
      wallet_address: string;
      first_seen_at: Date | string;
      last_seen_at: Date | string;
      total_volume_usd: string;
      total_trade_count: number;
      active_market_count: number;
      large_trade_count: number;
      average_trade_usd: string;
      max_trade_usd: string;
      recent_24h_volume_usd: string;
      recent_24h_trade_count: number;
      anomaly_trigger_count: number;
      high_signal_market_count: number;
      market_concentration: string | null;
      yes_buy_volume_usd: string;
      no_buy_volume_usd: string;
      buy_volume_usd: string;
      sell_volume_usd: string;
      avg_entry_price: string;
      avg_exit_price: string;
      market_categories: string[] | null;
      profitable_market_proxy_count: number;
      resolved_market_count: number;
      coordinated_flow_participation: boolean;
      proxy_pnl_usd: string;
      proxy_pnl_sample_count: number;
      proxy_pnl_resolved_count: number;
      timing_sample_count: number;
      favorable_timing_count: number;
      poor_timing_count: number;
      repeated_directional_market_count: number;
    }>(result).map((row) => ({
      walletAddress: row.wallet_address,
      firstSeenAt: toDate(row.first_seen_at),
      lastSeenAt: toDate(row.last_seen_at),
      totalVolumeUsd: toNumber(row.total_volume_usd),
      totalTradeCount: row.total_trade_count,
      activeMarketCount: row.active_market_count,
      largeTradeCount: row.large_trade_count,
      averageTradeUsd: toNumber(row.average_trade_usd),
      maxTradeUsd: toNumber(row.max_trade_usd),
      recent24hVolumeUsd: toNumber(row.recent_24h_volume_usd),
      recent24hTradeCount: row.recent_24h_trade_count,
      anomalyTriggerCount: row.anomaly_trigger_count,
      highSignalMarketCount: row.high_signal_market_count,
      marketConcentration: toNumber(row.market_concentration),
      yesBuyVolumeUsd: toNumber(row.yes_buy_volume_usd),
      noBuyVolumeUsd: toNumber(row.no_buy_volume_usd),
      buyVolumeUsd: toNumber(row.buy_volume_usd),
      sellVolumeUsd: toNumber(row.sell_volume_usd),
      avgEntryPrice: toNumber(row.avg_entry_price),
      avgExitPrice: toNumber(row.avg_exit_price),
      profitableMarketProxyCount: row.profitable_market_proxy_count,
      resolvedMarketCount: row.resolved_market_count,
      specializationTags: specializationTags(row.market_categories ?? []),
      coordinatedFlowParticipation: row.coordinated_flow_participation,
      proxyPnlUsd: toNumber(row.proxy_pnl_usd),
      proxyPnlSampleCount: row.proxy_pnl_sample_count,
      proxyPnlResolvedCount: row.proxy_pnl_resolved_count,
      timingSampleCount: row.timing_sample_count,
      favorableTimingCount: row.favorable_timing_count,
      poorTimingCount: row.poor_timing_count,
      repeatedDirectionalMarketCount: row.repeated_directional_market_count
    }));
  },

  async getRecentWalletMarketActivity(
    since: Date,
    walletAddresses: string[]
  ): Promise<WalletMarketInput[]> {
    if (walletAddresses.length === 0) return [];
    const sinceIso = since.toISOString();
    logger.info("wallet_intelligence.array_query_params", {
      queryName: "getRecentWalletMarketActivity",
      walletCount: walletAddresses.length,
      marketCount: 0,
      sampleWallet: walletAddresses[0],
      sampleMarketId: null
    });
    const result = await db.execute(sql`
      SELECT
        wallet_address,
        market_id,
        SUM(usd_value::numeric)::text AS total_volume_usd,
        COUNT(*)::int AS trade_count,
        SUM(CASE WHEN side = 'buy' THEN quantity::numeric ELSE -quantity::numeric END)::text
          AS net_position_estimate,
        MAX(trade_timestamp) AS last_trade_at
      FROM trades
      WHERE trade_timestamp >= ${sinceIso}
        AND wallet_address IN ${textInSql(walletAddresses)}
        AND NOT (${invalidWalletSql})
      GROUP BY wallet_address, market_id
    `);

    return rows<{
      wallet_address: string;
      market_id: string;
      total_volume_usd: string;
      trade_count: number;
      net_position_estimate: string;
      last_trade_at: Date | string;
    }>(result).map((row) => ({
      walletAddress: row.wallet_address,
      marketId: row.market_id,
      totalVolumeUsd: toNumber(row.total_volume_usd),
      tradeCount: row.trade_count,
      netPositionEstimate: toNumber(row.net_position_estimate),
      lastTradeAt: toDate(row.last_trade_at)
    }));
  },

  async getRecentWalletDailyStats(
    since: Date,
    walletAddresses: string[]
  ): Promise<WalletDailyInput[]> {
    if (walletAddresses.length === 0) return [];
    const sinceIso = since.toISOString();
    logger.info("wallet_intelligence.array_query_params", {
      queryName: "getRecentWalletDailyStats",
      walletCount: walletAddresses.length,
      marketCount: 0,
      sampleWallet: walletAddresses[0],
      sampleMarketId: null
    });
    const result = await db.execute(sql`
      WITH wallet_days AS (
        SELECT
          wallet_address,
          date_trunc('day', trade_timestamp) AS bucket_date,
          SUM(usd_value::numeric) AS total_volume_usd,
          COUNT(*)::int AS trade_count,
          COUNT(DISTINCT market_id)::int AS active_markets
        FROM trades
        WHERE trade_timestamp >= ${sinceIso}
          AND wallet_address IN ${textInSql(walletAddresses)}
          AND NOT (${invalidWalletSql})
        GROUP BY wallet_address, date_trunc('day', trade_timestamp)
      ),
      anomaly_days AS (
        SELECT
          unnest(wallet_addresses) AS wallet_address,
          date_trunc('day', detected_at) AS bucket_date,
          COUNT(*)::int AS anomaly_count
        FROM anomaly_events
        WHERE detected_at >= ${sinceIso}
          AND array_length(wallet_addresses, 1) > 0
        GROUP BY 1, 2
      )
      SELECT
        wd.wallet_address,
        wd.bucket_date,
        wd.total_volume_usd::text,
        wd.trade_count,
        wd.active_markets,
        COALESCE(ad.anomaly_count, 0)::int AS anomaly_count
      FROM wallet_days wd
      LEFT JOIN anomaly_days ad
        ON ad.wallet_address = wd.wallet_address AND ad.bucket_date = wd.bucket_date
    `);

    return rows<{
      wallet_address: string;
      bucket_date: Date | string;
      total_volume_usd: string;
      trade_count: number;
      active_markets: number;
      anomaly_count: number;
    }>(result).map((row) => ({
      walletAddress: row.wallet_address,
      bucketDate: toDate(row.bucket_date),
      totalVolumeUsd: toNumber(row.total_volume_usd),
      tradeCount: row.trade_count,
      activeMarkets: row.active_markets,
      anomalyCount: row.anomaly_count
    }));
  },

  async upsertProfiles(profiles: Array<WalletProfileInput & WalletScores>) {
    if (profiles.length === 0) return 0;
    const values = profiles.map((profile) => ({
      walletAddress: profile.walletAddress,
      firstSeenAt: toIso(profile.firstSeenAt),
      lastSeenAt: toIso(profile.lastSeenAt),
      totalVolumeUsd: String(profile.totalVolumeUsd),
      totalTradeCount: profile.totalTradeCount,
      smartMoneyScore: String(profile.smartMoneyScore),
      convictionScore: String(profile.convictionScore),
      influenceScore: String(profile.influenceScore),
      activeMarketCount: profile.activeMarketCount,
      anomalyTriggerCount: profile.anomalyTriggerCount,
      lastActiveAt: toIso(profile.lastSeenAt),
      metadata: serializeJson(profile.metadata)
    }));

    await db.execute(
      sql`
      INSERT INTO wallet_profiles (
        wallet_address, first_seen_at, last_seen_at, total_volume_usd, total_trade_count,
        smart_money_score, conviction_score, influence_score, active_market_count,
        anomaly_trigger_count, last_active_at, metadata
      )
      SELECT * FROM jsonb_to_recordset(${JSON.stringify(serializeJson(values))}::jsonb) AS x(
        "walletAddress" text,
        "firstSeenAt" timestamptz,
        "lastSeenAt" timestamptz,
        "totalVolumeUsd" numeric,
        "totalTradeCount" int,
        "smartMoneyScore" numeric,
        "convictionScore" numeric,
        "influenceScore" numeric,
        "activeMarketCount" int,
        "anomalyTriggerCount" int,
        "lastActiveAt" timestamptz,
        "metadata" jsonb
      )
      ON CONFLICT (wallet_address) DO UPDATE SET
        first_seen_at = LEAST(wallet_profiles.first_seen_at, excluded.first_seen_at),
        last_seen_at = GREATEST(wallet_profiles.last_seen_at, excluded.last_seen_at),
        total_volume_usd = excluded.total_volume_usd,
        total_trade_count = excluded.total_trade_count,
        smart_money_score = excluded.smart_money_score,
        conviction_score = excluded.conviction_score,
        influence_score = excluded.influence_score,
        active_market_count = excluded.active_market_count,
        anomaly_trigger_count = excluded.anomaly_trigger_count,
        last_active_at = excluded.last_active_at,
        metadata = excluded.metadata
    ` as SQL
    );
    return profiles.length;
  },

  async upsertMarketActivity(items: WalletMarketInput[]) {
    if (items.length === 0) return 0;
    const values = items.map((item) => ({
      ...item,
      lastTradeAt: toIso(item.lastTradeAt)
    }));
    await db.execute(
      sql`
      INSERT INTO wallet_market_activity (
        wallet_address, market_id, total_volume_usd, trade_count, net_position_estimate, last_trade_at
      )
      SELECT * FROM jsonb_to_recordset(${JSON.stringify(serializeJson(values))}::jsonb) AS x(
        "walletAddress" text,
        "marketId" uuid,
        "totalVolumeUsd" numeric,
        "tradeCount" int,
        "netPositionEstimate" numeric,
        "lastTradeAt" timestamptz
      )
      ON CONFLICT (wallet_address, market_id) DO UPDATE SET
        total_volume_usd = excluded.total_volume_usd,
        trade_count = excluded.trade_count,
        net_position_estimate = excluded.net_position_estimate,
        last_trade_at = excluded.last_trade_at
    ` as SQL
    );
    return items.length;
  },

  async upsertDailyStats(items: WalletDailyInput[]) {
    if (items.length === 0) return 0;
    const values = items.map((item) => ({
      ...item,
      bucketDate: toDateOnly(item.bucketDate)
    }));
    await db.execute(
      sql`
      INSERT INTO wallet_daily_stats (
        wallet_address, bucket_date, total_volume_usd, trade_count, active_markets, anomaly_count
      )
      SELECT * FROM jsonb_to_recordset(${JSON.stringify(serializeJson(values))}::jsonb) AS x(
        "walletAddress" text,
        "bucketDate" timestamptz,
        "totalVolumeUsd" numeric,
        "tradeCount" int,
        "activeMarkets" int,
        "anomalyCount" int
      )
      ON CONFLICT (wallet_address, bucket_date) DO UPDATE SET
        total_volume_usd = excluded.total_volume_usd,
        trade_count = excluded.trade_count,
        active_markets = excluded.active_markets,
        anomaly_count = excluded.anomaly_count
    ` as SQL
    );
    return items.length;
  },

  async getCoordinatedActivityCandidates(
    since: Date,
    threshold: number,
    minVolumeUsd: number
  ): Promise<CoordinatedActivityCandidate[]> {
    const sinceIso = since.toISOString();
    const result = await db.execute(sql`
      SELECT
        market_id,
        ARRAY_AGG(DISTINCT wallet_address) AS wallet_addresses,
        COUNT(*)::int AS trade_count,
        SUM(usd_value::numeric)::text AS total_volume_usd,
        MIN(trade_timestamp) AS started_at,
        MAX(trade_timestamp) AS ended_at
      FROM trades
      WHERE trade_timestamp >= ${sinceIso}
        AND usd_value::numeric >= ${minVolumeUsd}
      GROUP BY market_id, date_trunc('minute', trade_timestamp)
      HAVING COUNT(DISTINCT wallet_address) >= ${threshold}
      ORDER BY MAX(trade_timestamp) DESC
      LIMIT 25
    `);

    return rows<{
      market_id: string;
      wallet_addresses: string[];
      trade_count: number;
      total_volume_usd: string;
      started_at: Date | string;
      ended_at: Date | string;
    }>(result).map((row) => ({
      marketId: row.market_id,
      walletAddresses: row.wallet_addresses,
      tradeCount: row.trade_count,
      totalVolumeUsd: toNumber(row.total_volume_usd),
      startedAt: toDate(row.started_at),
      endedAt: toDate(row.ended_at)
    }));
  },

  async getSmartFlowCandidates(since: Date, minVolumeUsd: number): Promise<SmartFlowCandidate[]> {
    const sinceIso = since.toISOString();
    const result = await db.execute(sql`
      WITH directional_flow AS (
        SELECT
          t.market_id,
          m.title AS market_title,
          t.side::text AS side,
          lower(COALESCE(t.outcome, 'unknown')) AS outcome,
          ARRAY_AGG(DISTINCT t.wallet_address) AS wallet_addresses,
          COUNT(*)::int AS trade_count,
          SUM(t.usd_value::numeric)::text AS total_volume_usd,
          MAX(wallet_market.wallet_volume_usd)::text AS max_wallet_volume_usd,
          MIN(t.trade_timestamp) AS started_at,
          MAX(t.trade_timestamp) AS ended_at
        FROM trades t
        INNER JOIN markets m ON m.id = t.market_id
        INNER JOIN (
          SELECT market_id, wallet_address, SUM(usd_value::numeric) AS wallet_volume_usd
          FROM trades
          WHERE trade_timestamp >= ${sinceIso}
            AND NOT (${invalidWalletSql})
          GROUP BY market_id, wallet_address
        ) wallet_market
          ON wallet_market.market_id = t.market_id
          AND wallet_market.wallet_address = t.wallet_address
        WHERE t.trade_timestamp >= ${sinceIso}
          AND NOT (${invalidWalletSql})
        GROUP BY t.market_id, m.title, t.side::text, lower(COALESCE(t.outcome, 'unknown')),
          date_trunc('minute', t.trade_timestamp)
      )
      SELECT
        market_id,
        market_title,
        side,
        NULLIF(outcome, 'unknown') AS outcome,
        wallet_addresses,
        trade_count,
        total_volume_usd,
        max_wallet_volume_usd,
        started_at,
        ended_at,
        CASE
          WHEN side = 'buy' AND outcome = 'yes' AND total_volume_usd::numeric >= ${minVolumeUsd * 2}
            THEN 'large_concentrated_yes_buying'
          WHEN max_wallet_volume_usd::numeric / NULLIF(total_volume_usd::numeric, 0) >= 0.65
            THEN 'high_conviction_accumulation'
          WHEN trade_count >= 8 AND total_volume_usd::numeric >= ${minVolumeUsd}
            THEN 'unusual_wallet_activity'
          ELSE 'synchronized_directional_flow'
        END AS signal_kind
      FROM directional_flow
      WHERE total_volume_usd::numeric >= ${minVolumeUsd}
        AND (
          (side = 'buy' AND outcome = 'yes' AND total_volume_usd::numeric >= ${minVolumeUsd * 2})
          OR max_wallet_volume_usd::numeric / NULLIF(total_volume_usd::numeric, 0) >= 0.65
          OR trade_count >= 8
          OR array_length(wallet_addresses, 1) >= 3
        )
      ORDER BY total_volume_usd::numeric DESC, trade_count DESC
      LIMIT 30
    `);

    return rows<{
      market_id: string;
      market_title: string;
      side: "buy" | "sell";
      outcome: string | null;
      wallet_addresses: string[];
      trade_count: number;
      total_volume_usd: string;
      max_wallet_volume_usd: string;
      started_at: Date | string;
      ended_at: Date | string;
      signal_kind: SmartFlowCandidate["signalKind"];
    }>(result).map((row) => ({
      marketId: row.market_id,
      marketTitle: row.market_title,
      walletAddresses: row.wallet_addresses,
      side: row.side,
      outcome: row.outcome,
      tradeCount: row.trade_count,
      totalVolumeUsd: toNumber(row.total_volume_usd),
      maxWalletVolumeUsd: toNumber(row.max_wallet_volume_usd),
      startedAt: toDate(row.started_at),
      endedAt: toDate(row.ended_at),
      signalKind: row.signal_kind
    }));
  },

  async findRecentDuplicate(marketId: string, anomalyType: string, since: Date) {
    const sinceIso = since.toISOString();
    const result = await db.execute(sql`
      SELECT id
      FROM anomaly_events
      WHERE market_id = ${marketId}
        AND anomaly_type::text = ${anomalyType}
        AND created_at >= ${sinceIso}
      LIMIT 1
    `);

    return rows<{ id: string }>(result)[0] ?? null;
  },

  async insertWalletAnomaly(input: {
    marketId: string;
    anomalyType:
      | "whale_activity"
      | "repeat_whale_activity"
      | "wallet_cluster"
      | "coordinated_wallet_activity";
    severityScore: number;
    confidenceScore: number;
    summary: string;
    walletAddresses: string[];
    metadata: Record<string, unknown>;
    detectedAt: Date;
  }) {
    const detectedAtIso = input.detectedAt.toISOString();
    logger.info("wallet_intelligence.array_query_params", {
      queryName: "insertWalletAnomaly",
      walletCount: input.walletAddresses.length,
      marketCount: 1,
      sampleWallet: input.walletAddresses[0] ?? null,
      sampleMarketId: input.marketId
    });
    await db.execute(sql`
      INSERT INTO anomaly_events (
        market_id, anomaly_type, severity_score, confidence_score, summary,
        wallet_addresses, metadata, detected_at
      )
      VALUES (
        ${input.marketId},
        ${input.anomalyType}::anomaly_type,
        ${String(input.severityScore)},
        ${String(input.confidenceScore)},
        ${input.summary},
        ${textArraySql(input.walletAddresses)},
        ${JSON.stringify(serializeJson(input.metadata))}::jsonb,
        ${detectedAtIso}
      )
    `);
  }
});

export type WalletIntelligenceRepository = ReturnType<typeof createWalletIntelligenceRepository>;
