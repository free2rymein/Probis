import type { MarketHistoryPoint } from "@probis/types";
import { getSql } from "@/lib/db";
import { withApiHandler } from "@/lib/handler";
import { historyQuerySchema, queryObject } from "@/lib/query";
import { ok } from "@/lib/responses";

const numeric = (value: string | null) => (value === null ? null : Number(value));

export const GET = withApiHandler(async (request, { requestId }, routeContext) => {
  const { id } = await (routeContext as { params: Promise<{ id: string }> }).params;
  const query = historyQuerySchema.parse(queryObject(request));
  const rows = await getSql()<Array<{ id: string; market_id: string; snapshot_time: Date; probability: string | null; volume: string | null; liquidity: string | null; open_interest: string | null }>>`
    select id, market_id, snapshot_time, probability::text, volume::text, liquidity::text, open_interest::text
    from market_snapshots
    where market_id = ${id}::uuid
      and (${query.from ?? null}::timestamptz is null or snapshot_time >= ${query.from ?? null})
      and (${query.to ?? null}::timestamptz is null or snapshot_time <= ${query.to ?? null})
    order by snapshot_time desc
    limit ${query.limit}
  `;
  const history: MarketHistoryPoint[] = rows.reverse().map((row) => ({
    id: row.id, marketId: row.market_id, snapshotTime: row.snapshot_time.toISOString(),
    probability: numeric(row.probability), volume: numeric(row.volume), liquidity: numeric(row.liquidity),
    openInterest: numeric(row.open_interest)
  }));
  return ok(history, requestId);
});
