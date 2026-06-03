import { getSql } from "@/lib/db";
import { withApiHandler } from "@/lib/handler";
import { marketSelect } from "@/lib/market-query";
import { marketFromRow, type MarketRow } from "@/lib/market-serializer";
import { fail, ok } from "@/lib/responses";
import { explorerValidMarket } from "@/lib/explorer-market-filter";

export const GET = withApiHandler(async (_request, { requestId }, routeContext) => {
  const { id } = await (routeContext as { params: Promise<{ id: string }> }).params;
  const rows = await getSql().unsafe<MarketRow[]>(`${marketSelect} where m.id = $1::uuid and ${explorerValidMarket("m")} limit 1`, [id]);
  const market = rows[0];
  return market ? ok(marketFromRow(market), requestId) : fail("NOT_FOUND", "Market not found.", requestId, 404);
});
