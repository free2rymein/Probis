import { getSql } from "@/lib/db";
import { runCategoriesQuery } from "@/lib/categories-query-runner";
import { getEventsQueryMode } from "@/lib/events-query-mode";
import { withApiHandler } from "@/lib/handler";
import { categoriesQuerySchema, queryObject } from "@/lib/query";
import { ok } from "@/lib/responses";
import type { Category } from "@probis/types";
import { cacheKey, getCached, setCached } from "@/lib/server-cache";
import { elapsedMs, logApiTiming } from "@/lib/timing";

export const GET = withApiHandler(async (request, { requestId }) => {
  const totalStartedAt = performance.now();
  const query = categoriesQuerySchema.parse(queryObject(request));
  const queryMode = getEventsQueryMode();
  const key = cacheKey("categories", { queryMode, query });
  const cacheLookupStartedAt = performance.now();
  const cached = getCached<Category[]>(key);
  const cacheLookupMs = elapsedMs(cacheLookupStartedAt);
  if (cached) {
    const responseStartedAt = performance.now();
    const response = ok(cached, requestId);
    logApiTiming("categories.complete", {
      requestId,
      cache: "hit",
      queryMode,
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
  } = await runCategoriesQuery(sql, query, queryMode);
  if (fallbackReason) {
    logApiTiming("categories.read_model_fallback", {
      requestId,
      queryMode,
      fallbackReason,
      healthCheckMs
    });
  }
  const response = queryResult.response;
  setCached(key, response);
  const responseStartedAt = performance.now();
  const result = ok(response, requestId);
  logApiTiming("categories.complete", {
    requestId,
    cache: "miss",
    queryMode,
    queryPath,
    fallbackReason,
    healthCheckMs,
    cacheLookupMs,
    sqlClientMs,
    categoryQueryMs: queryResult.categoryQueryMs,
    transformationMs: queryResult.transformationMs,
    responseCreationMs: elapsedMs(responseStartedAt),
    totalMs: elapsedMs(totalStartedAt)
  });
  return result;
});
