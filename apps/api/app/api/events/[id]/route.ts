import type { EventDetail } from "@probis/types";
import { getSql } from "@/lib/db";
import { associatedMarketsSelect } from "@/lib/event-associated-market-query";
import { associatedMarketFromRow, eventFromRow, type AssociatedMarketRow, type EventRow } from "@/lib/event-serializer";
import { eventSelect } from "@/lib/event-query";
import { withApiHandler } from "@/lib/handler";
import { fail, ok } from "@/lib/responses";

export const GET = withApiHandler(async (_request, { requestId }, routeContext) => {
  const { id } = await (routeContext as { params: Promise<{ id: string }> }).params;
  const sql = getSql();
  const [rows, marketRows] = await Promise.all([
    sql.unsafe<EventRow[]>(`${eventSelect({ includeDescription: true, includeClosedMarkets: true })} where e.id = $1::uuid limit 1`, [id]),
    sql.unsafe<AssociatedMarketRow[]>(associatedMarketsSelect({ includeClosedMarkets: true }), [id])
  ]);
  const event = rows[0];
  if (!event) return fail("NOT_FOUND", "Event not found.", requestId, 404);

  const response: EventDetail = {
    ...eventFromRow(event),
    description: event.description ?? null,
    markets: marketRows.map(associatedMarketFromRow)
  };
  return ok(response, requestId);
});
