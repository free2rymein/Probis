import { sql, type SQL } from "drizzle-orm";
import type { ProbisDatabase } from "@probis/database";
import type {
  CoordinatedActivityCandidate,
  WalletDailyInput,
  WalletMarketInput,
  WalletProfileInput,
  WalletScores
} from "../types";

const rows = <T>(result: unknown): T[] => {
  if (Array.isArray(result)) return result as T[];
  if (result && typeof result === "object" && "rows" in result) {
    return (result as { rows: T[] }).rows;
  }
  return [];
};

const toDate = (value: Date | string) => (value instanceof Date ? value : new Date(value));
const toNumber = (value: string | number | null) => Number(value ?? 0);

export const createWalletIntelligenceRepository = (db: ProbisDatabase) => ({
  async getRecentWalletProfiles(
    since: Date,
    largeTradeThresholdUsd: number,
    limit: number
  ): Promise<WalletProfileInput[]> {
    const result = await db.execute(sql`
      WITH recent_trades AS (
        SELECT wallet_address, market_id, usd_value::numeric AS usd_value, trade_timestamp
        FROM trades
        WHERE trade_timestamp >= ${since}
      ),
      wallet_market AS (
        SELECT wallet_address, market_id, SUM(usd_value) AS market_volume
        FROM recent_trades
        GROUP BY wallet_address, market_id
      ),
      wallet_anomalies AS (
        SELECT
          unnest(wallet_addresses) AS wallet_address,
          COUNT(*)::int AS anomaly_trigger_count,
          COUNT(DISTINCT market_id)::int AS high_signal_market_count
        FROM anomaly_events
        WHERE detected_at >= ${since}
          AND array_length(wallet_addresses, 1) > 0
        GROUP BY 1
      )
      SELECT
        rt.wallet_address,
        MIN(rt.trade_timestamp) AS first_seen_at,
        MAX(rt.trade_timestamp) AS last_seen_at,
        SUM(rt.usd_value)::text AS total_volume_usd,
        COUNT(*)::int AS total_trade_count,
        COUNT(DISTINCT rt.market_id)::int AS active_market_count,
        COUNT(*) FILTER (WHERE rt.usd_value >= ${largeTradeThresholdUsd})::int AS large_trade_count,
        AVG(rt.usd_value)::text AS average_trade_usd,
        MAX(rt.usd_value)::text AS max_trade_usd,
        COALESCE(wa.anomaly_trigger_count, 0)::int AS anomaly_trigger_count,
        COALESCE(wa.high_signal_market_count, 0)::int AS high_signal_market_count,
        (MAX(wm.market_volume) / NULLIF(SUM(rt.usd_value), 0))::text AS market_concentration
      FROM recent_trades rt
      INNER JOIN wallet_market wm ON wm.wallet_address = rt.wallet_address
      LEFT JOIN wallet_anomalies wa ON wa.wallet_address = rt.wallet_address
      GROUP BY rt.wallet_address, wa.anomaly_trigger_count, wa.high_signal_market_count
      HAVING SUM(rt.usd_value) > 0
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
      anomaly_trigger_count: number;
      high_signal_market_count: number;
      market_concentration: string | null;
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
      anomalyTriggerCount: row.anomaly_trigger_count,
      highSignalMarketCount: row.high_signal_market_count,
      marketConcentration: toNumber(row.market_concentration)
    }));
  },

  async getRecentWalletMarketActivity(
    since: Date,
    walletAddresses: string[]
  ): Promise<WalletMarketInput[]> {
    if (walletAddresses.length === 0) return [];
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
      WHERE trade_timestamp >= ${since}
        AND wallet_address = ANY(${walletAddresses})
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
    const result = await db.execute(sql`
      WITH wallet_days AS (
        SELECT
          wallet_address,
          date_trunc('day', trade_timestamp) AS bucket_date,
          SUM(usd_value::numeric) AS total_volume_usd,
          COUNT(*)::int AS trade_count,
          COUNT(DISTINCT market_id)::int AS active_markets
        FROM trades
        WHERE trade_timestamp >= ${since}
          AND wallet_address = ANY(${walletAddresses})
        GROUP BY wallet_address, date_trunc('day', trade_timestamp)
      ),
      anomaly_days AS (
        SELECT
          unnest(wallet_addresses) AS wallet_address,
          date_trunc('day', detected_at) AS bucket_date,
          COUNT(*)::int AS anomaly_count
        FROM anomaly_events
        WHERE detected_at >= ${since}
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
    if (profiles.length === 0) return;
    const values = profiles.map((profile) => ({
      walletAddress: profile.walletAddress,
      firstSeenAt: profile.firstSeenAt,
      lastSeenAt: profile.lastSeenAt,
      totalVolumeUsd: String(profile.totalVolumeUsd),
      totalTradeCount: profile.totalTradeCount,
      smartMoneyScore: String(profile.smartMoneyScore),
      convictionScore: String(profile.convictionScore),
      influenceScore: String(profile.influenceScore),
      activeMarketCount: profile.activeMarketCount,
      anomalyTriggerCount: profile.anomalyTriggerCount,
      lastActiveAt: profile.lastSeenAt,
      metadata: profile.metadata
    }));

    await db.execute(
      sql`
      INSERT INTO wallet_profiles (
        wallet_address, first_seen_at, last_seen_at, total_volume_usd, total_trade_count,
        smart_money_score, conviction_score, influence_score, active_market_count,
        anomaly_trigger_count, last_active_at, metadata
      )
      SELECT * FROM jsonb_to_recordset(${JSON.stringify(values)}::jsonb) AS x(
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
  },

  async upsertMarketActivity(items: WalletMarketInput[]) {
    if (items.length === 0) return;
    await db.execute(
      sql`
      INSERT INTO wallet_market_activity (
        wallet_address, market_id, total_volume_usd, trade_count, net_position_estimate, last_trade_at
      )
      SELECT * FROM jsonb_to_recordset(${JSON.stringify(items)}::jsonb) AS x(
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
  },

  async upsertDailyStats(items: WalletDailyInput[]) {
    if (items.length === 0) return;
    await db.execute(
      sql`
      INSERT INTO wallet_daily_stats (
        wallet_address, bucket_date, total_volume_usd, trade_count, active_markets, anomaly_count
      )
      SELECT * FROM jsonb_to_recordset(${JSON.stringify(items)}::jsonb) AS x(
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
  },

  async getCoordinatedActivityCandidates(
    since: Date,
    threshold: number,
    minVolumeUsd: number
  ): Promise<CoordinatedActivityCandidate[]> {
    const result = await db.execute(sql`
      SELECT
        market_id,
        ARRAY_AGG(DISTINCT wallet_address) AS wallet_addresses,
        COUNT(*)::int AS trade_count,
        SUM(usd_value::numeric)::text AS total_volume_usd,
        MIN(trade_timestamp) AS started_at,
        MAX(trade_timestamp) AS ended_at
      FROM trades
      WHERE trade_timestamp >= ${since}
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

  async findRecentDuplicate(marketId: string, anomalyType: string, since: Date) {
    const result = await db.execute(sql`
      SELECT id
      FROM anomaly_events
      WHERE market_id = ${marketId}
        AND anomaly_type::text = ${anomalyType}
        AND created_at >= ${since}
      LIMIT 1
    `);

    return rows<{ id: string }>(result)[0] ?? null;
  },

  async insertWalletAnomaly(input: {
    marketId: string;
    anomalyType: "repeat_whale_activity" | "coordinated_wallet_activity";
    severityScore: number;
    confidenceScore: number;
    summary: string;
    walletAddresses: string[];
    metadata: Record<string, unknown>;
    detectedAt: Date;
  }) {
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
        ${input.walletAddresses},
        ${JSON.stringify(input.metadata)}::jsonb,
        ${input.detectedAt}
      )
    `);
  }
});

export type WalletIntelligenceRepository = ReturnType<typeof createWalletIntelligenceRepository>;
