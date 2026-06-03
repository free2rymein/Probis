import type { WalletIntelligenceSummary } from "@probis/types";
import { getSql } from "@/lib/db";
import { withApiHandler } from "@/lib/handler";
import { corsHeaders, ok } from "@/lib/responses";

export const GET = withApiHandler(async (_request, { requestId }) => {
  const sql = getSql();
  const rows = await sql<
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
    ORDER BY smart_money_score DESC, influence_score DESC
    LIMIT 10
  `;

  const data: WalletIntelligenceSummary[] = rows.map((row) => ({
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
  }));

  return ok(data, requestId);
});

export const OPTIONS = () => new Response(null, { status: 204, headers: corsHeaders });
