import type { PaginatedResponse, WalletActivityPoint } from "@probis/types";
import { getSql } from "@/lib/db";
import { withApiHandler } from "@/lib/handler";
import { queryObject, walletActivityQuerySchema } from "@/lib/query";
import { corsHeaders, ok } from "@/lib/responses";

export const GET = withApiHandler(async (request, { requestId }) => {
  const query = walletActivityQuerySchema.parse(queryObject(request));
  const sql = getSql();

  const rows = await sql<
    Array<{
      wallet_address: string;
      total_volume_usd: string;
      trade_count: string;
      active_markets: string;
      last_active_at: Date;
      total_count: string;
    }>
  >`
    SELECT
      wds.wallet_address,
      SUM(wds.total_volume_usd)::text AS total_volume_usd,
      SUM(wds.trade_count)::text AS trade_count,
      MAX(wds.active_markets)::text AS active_markets,
      wp.last_active_at,
      COUNT(*) OVER()::text AS total_count
    FROM wallet_daily_stats wds
    INNER JOIN wallet_profiles wp ON wp.wallet_address = wds.wallet_address
    WHERE wds.bucket_date >= date_trunc('day', now() - (${query.lookbackDays}::int * interval '1 day'))
    GROUP BY wds.wallet_address, wp.last_active_at
    ORDER BY SUM(wds.total_volume_usd) DESC
    LIMIT ${query.limit}
    OFFSET ${query.offset}
  `;

  const total = Number(rows[0]?.total_count ?? 0);
  const data: PaginatedResponse<WalletActivityPoint> = {
    items: rows.map((row) => ({
      walletAddress: row.wallet_address,
      totalVolumeUsd: Number(row.total_volume_usd),
      tradeCount: Number(row.trade_count),
      activeMarkets: Number(row.active_markets),
      lastActiveAt: row.last_active_at.toISOString()
    })),
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
