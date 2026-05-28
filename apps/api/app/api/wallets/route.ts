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
  if (sort === "influence_score") return sql`influence_score ${dir}, last_active_at DESC`;
  if (sort === "total_volume_usd") return sql`total_volume_usd ${dir}, last_active_at DESC`;
  if (sort === "last_active_at") return sql`last_active_at ${dir}`;
  return sql`smart_money_score ${dir}, influence_score DESC`;
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
      COUNT(*) OVER()::text AS total_count
    FROM wallet_profiles
    WHERE ${search}::text IS NULL OR wallet_address ILIKE ${search}
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
