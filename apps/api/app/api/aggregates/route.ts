import type { AggregatePoint } from "@probis/types";
import { getSql } from "@/lib/db";
import { withApiHandler } from "@/lib/handler";
import { aggregatesQuerySchema, queryObject } from "@/lib/query";
import { corsHeaders, ok } from "@/lib/responses";

type AggregateRow = {
  market_id: string;
  bucket: Date;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
  trade_count: number;
};

export const GET = withApiHandler(async (request, { requestId }) => {
  const query = aggregatesQuerySchema.parse(queryObject(request));
  const sql = getSql();

  const rows = await sql<AggregateRow[]>`
    SELECT market_id, bucket, open::text, high::text, low::text, close::text, volume::text, trade_count
    FROM market_aggregates_1m
    WHERE
      market_id = ${query.marketId}
      AND (${query.from ?? null}::timestamptz IS NULL OR bucket >= ${query.from ?? null})
      AND (${query.to ?? null}::timestamptz IS NULL OR bucket <= ${query.to ?? null})
    ORDER BY bucket DESC
    LIMIT ${query.limit}
  `;

  const data: AggregatePoint[] = rows.reverse().map((row) => ({
    marketId: row.market_id,
    bucket: row.bucket.toISOString(),
    open: Number(row.open),
    high: Number(row.high),
    low: Number(row.low),
    close: Number(row.close),
    volume: Number(row.volume),
    tradeCount: row.trade_count
  }));

  return ok(data, requestId);
});

export const OPTIONS = () => new Response(null, { status: 204, headers: corsHeaders });
