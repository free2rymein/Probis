import type { EventDetail } from "@probis/types";
import { getSql } from "@/lib/db";
import { associatedMarketsSelect } from "@/lib/event-associated-market-query";
import { associatedMarketFromRow, eventFromRow, type AssociatedMarketRow, type EventRow } from "@/lib/event-serializer";
import { eventSelect } from "@/lib/event-query";
import { withApiHandler } from "@/lib/handler";
import { fail, ok } from "@/lib/responses";
import { cacheKey, getCached, setCached } from "@/lib/server-cache";
import { elapsedMs, logApiTiming } from "@/lib/timing";

// In-process cache for local/single-instance deployments. Short TTL keeps
// pipeline refreshes visible without building cross-instance invalidation yet.
const EVENT_DETAIL_CACHE_TTL_MS = 60_000;

export const GET = withApiHandler(async (_request, { requestId }, routeContext) => {
  const totalStartedAt = performance.now();
  const { id } = await (routeContext as { params: Promise<{ id: string }> }).params;
  const key = cacheKey("event-detail", { id });
  const cacheLookupStartedAt = performance.now();
  const cached = getCached<EventDetail>(key);
  const cacheLookupMs = elapsedMs(cacheLookupStartedAt);
  if (cached) {
    logApiTiming("event_detail.complete", {
      requestId,
      eventId: id,
      cache: "hit",
      found: true,
      cacheLookupMs,
      associatedMarketCount: cached.markets.length,
      payloadBytes: Buffer.byteLength(JSON.stringify(cached)),
      totalMs: elapsedMs(totalStartedAt)
    });
    return ok(cached, requestId);
  }

  const sql = getSql();
  const databaseStartedAt = performance.now();
  const [rows, marketRows] = await Promise.all([
    sql.unsafe<EventRow[]>(`${eventSelect({ includeDescription: true, includeClosedMarkets: true })} where e.id = $1::uuid limit 1`, [id]),
    sql.unsafe<AssociatedMarketRow[]>(associatedMarketsSelect({ includeClosedMarkets: true }), [id])
  ]);
  const databaseMs = elapsedMs(databaseStartedAt);
  const event = rows[0];
  if (!event) {
    logApiTiming("event_detail.complete", {
      requestId,
      eventId: id,
      cache: "miss",
      found: false,
      cacheLookupMs,
      databaseMs,
      associatedMarketCount: marketRows.length,
      totalMs: elapsedMs(totalStartedAt)
    });
    return fail("NOT_FOUND", "Event not found.", requestId, 404);
  }

  const transformationStartedAt = performance.now();
  const response: EventDetail = {
    ...eventFromRow(event),
    description: event.description ?? null,
    markets: marketRows.map(associatedMarketFromRow)
  };
  const transformationMs = elapsedMs(transformationStartedAt);
  const serializationStartedAt = performance.now();
  const payloadBytes = Buffer.byteLength(JSON.stringify(response));
  const serializationMs = elapsedMs(serializationStartedAt);
  setCached(key, response, EVENT_DETAIL_CACHE_TTL_MS);
  logApiTiming("event_detail.complete", {
    requestId,
    eventId: id,
    cache: "miss",
    found: true,
    cacheLookupMs,
    databaseMs,
    associatedMarketCount: marketRows.length,
    transformationMs,
    serializationMs,
    payloadBytes,
    totalMs: elapsedMs(totalStartedAt)
  });
  return ok(response, requestId);
});
