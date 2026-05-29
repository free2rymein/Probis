import type { PaginatedResponse, WalletIntelligenceSummary } from "@probis/types";
import { getSql } from "@/lib/db";
import { withApiHandler } from "@/lib/handler";
import { queryObject, walletsQuerySchema } from "@/lib/query";
import { corsHeaders, ok } from "@/lib/responses";

type WalletRow = {
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
  total_count: string;
};

const orderClause = (sql: ReturnType<typeof getSql>, sort: string, direction: "asc" | "desc") => {
  const dir = direction === "asc" ? sql`ASC` : sql`DESC`;
  if (sort === "influence_score") return sql`effective_influence_score ${dir}, last_active_at DESC`;
  if (sort === "total_volume_usd") return sql`meaningful_volume_usd ${dir}, last_active_at DESC`;
  if (sort === "last_active_at") return sql`last_active_at ${dir}`;
  return sql`effective_smart_money_score ${dir}, conviction_score DESC, meaningful_volume_usd DESC`;
};

const mapWallet = (row: WalletRow): WalletIntelligenceSummary => ({
  walletAddress: row.wallet_address,
  firstSeenAt: row.first_seen_at.toISOString(),
  lastSeenAt: row.last_seen_at.toISOString(),
  totalVolumeUsd: Number(row.total_volume_usd),
  totalTradeCount: row.total_trade_count,
  smartMoneyScore: Number(row.smart_money_score),
  convictionScore: Number(row.conviction_score),
  influenceScore: Number(row.influence_score),
  activeMarketCount: row.active_market_count,
  anomalyTriggerCount: row.anomaly_trigger_count,
  lastActiveAt: row.last_active_at.toISOString(),
  metadata: row.metadata
});

export const GET = withApiHandler(async (request, { requestId }) => {
  const query = walletsQuerySchema.parse(queryObject(request));
  const search = query.search ? `%${query.search}%` : null;
  const sql = getSql();

  const rows = await sql<WalletRow[]>`
    WITH ranked_wallets AS (
      SELECT DISTINCT ON (lower(wallet_address))
        wallet_address,
        first_seen_at,
        last_seen_at,
        total_volume_usd,
        total_trade_count,
        smart_money_score,
        conviction_score,
        influence_score,
        active_market_count,
        anomaly_trigger_count,
        last_active_at,
        metadata,
        CASE
          WHEN total_trade_count < 2 AND total_volume_usd < 100 THEN 0.35
          WHEN total_trade_count < 5 AND total_volume_usd < 1000 THEN 0.70
          ELSE 1
        END AS activity_multiplier,
        total_volume_usd AS meaningful_volume_usd
      FROM wallet_profiles
      WHERE (${search}::text IS NULL OR wallet_address ILIKE ${search})
        AND (total_trade_count >= 2 OR total_volume_usd >= 100)
      ORDER BY lower(wallet_address), last_active_at DESC
    ),
    scored_wallets AS (
      SELECT
        *,
        (
          smart_money_score * 0.30 +
          conviction_score * 0.30 +
          influence_score * 0.15 +
          COALESCE((metadata->>'recent_activity_score')::numeric, 0) * 0.15 +
          COALESCE((metadata->>'concentration_score')::numeric, 0) * 0.10
        ) * activity_multiplier AS effective_smart_money_score,
        (influence_score * 0.70 + COALESCE((metadata->>'recent_activity_score')::numeric, 0) * 0.30)
          * activity_multiplier AS effective_influence_score,
        COUNT(*) OVER()::text AS total_count
      FROM ranked_wallets
    )
    SELECT
      wallet_address,
      first_seen_at,
      last_seen_at,
      total_volume_usd::text,
      total_trade_count,
      smart_money_score::text,
      conviction_score::text,
      influence_score::text,
      active_market_count,
      anomaly_trigger_count,
      last_active_at,
      metadata,
      total_count
    FROM scored_wallets
    ORDER BY ${orderClause(sql, query.sort, query.direction)}
    LIMIT ${query.limit}
    OFFSET ${query.offset}
  `;

  const total = Number(rows[0]?.total_count ?? 0);
  const data: PaginatedResponse<WalletIntelligenceSummary> = {
    items: rows.map(mapWallet),
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
