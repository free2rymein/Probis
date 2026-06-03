import type { EventListItem, PaginatedResponse } from "@probis/types";
import { getSql } from "@/lib/db";
import { getEventsQueryMode } from "@/lib/events-query-mode";
import { runEventsQuery } from "@/lib/events-query-runner";
import { withApiHandler } from "@/lib/handler";
import { eventsQuerySchema, queryObject } from "@/lib/query";
import { ok } from "@/lib/responses";
import { cacheKey, getCached, setCached } from "@/lib/server-cache";
import { elapsedMs, logApiTiming } from "@/lib/timing";

export const GET = withApiHandler(async (request, { requestId }) => {
  const totalStartedAt = performance.now();
  logApiTiming("events.request_received", { requestId });
  const parsingStartedAt = performance.now();
  const query = eventsQuerySchema.parse(queryObject(request));
  const queryMode = getEventsQueryMode();
  const parsingMs = elapsedMs(parsingStartedAt);
  const key = cacheKey("events", { queryMode, query });
  const cacheLookupStartedAt = performance.now();
  const cached = getCached<PaginatedResponse<EventListItem>>(key);
  const cacheLookupMs = elapsedMs(cacheLookupStartedAt);
  if (cached) {
    const responseStartedAt = performance.now();
    const response = ok(cached, requestId);
    logApiTiming("events.complete", {
      requestId,
      cache: "hit",
      queryMode,
      parsingMs,
      cacheLookupMs,
      responseCreationMs: elapsedMs(responseStartedAt),
      totalMs: elapsedMs(totalStartedAt)
    });
    return response;
  }
  const sqlClientStartedAt = performance.now();
  const sql = getSql();
  const sqlClientMs = elapsedMs(sqlClientStartedAt);
  const {
    result: queryResult,
    queryPath,
    fallbackReason,
    healthCheckMs
  } = await runEventsQuery(sql, query, queryMode);
  if (fallbackReason) {
    logApiTiming("events.read_model_fallback", {
      requestId,
      queryMode,
      fallbackReason,
      healthCheckMs
    });
  }
  const response = queryResult.response;
  const serializationStartedAt = performance.now();
  const payloadBytes = Buffer.byteLength(JSON.stringify(response));
  const serializationMs = elapsedMs(serializationStartedAt);
  setCached(key, response);
  logApiTiming("events.complete", {
    requestId,
    cache: "miss",
    queryMode,
    queryPath,
    fallbackReason,
    healthCheckMs,
    parsingMs,
    cacheLookupMs,
    sqlClientMs,
    databaseMs: queryResult.databaseMs,
    countQueryMs: queryResult.countQueryMs,
    cardQueryMs: queryResult.cardQueryMs,
    combinedQueryMs: queryResult.combinedQueryMs ?? null,
    hydratedEventCount: queryResult.hydratedEventCount,
    transformationMs: queryResult.transformationMs,
    serializationMs,
    payloadBytes,
    totalMs: elapsedMs(totalStartedAt)
  });
  const responseStartedAt = performance.now();
  const result = ok(response, requestId);
  logApiTiming("events.response_created", { requestId, responseCreationMs: elapsedMs(responseStartedAt) });
  return result;
});
