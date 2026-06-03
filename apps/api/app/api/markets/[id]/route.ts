import { getSql } from "@/lib/db";
import { withApiHandler } from "@/lib/handler";
import { marketSelect } from "@/lib/market-query";
import { marketFromRow, type MarketRow } from "@/lib/market-serializer";
import { fail, ok } from "@/lib/responses";
import { explorerValidMarket } from "@/lib/explorer-market-filter";
import { cacheKey, getCached, setCached } from "@/lib/server-cache";
import { elapsedMs, logApiTiming } from "@/lib/timing";

// In-process cache for local/single-instance deployments. Short TTL keeps
// pipeline refreshes visible without building cross-instance invalidation yet.
const MARKET_DETAIL_CACHE_TTL_MS = 60_000;

export const GET = withApiHandler(async (_request, { requestId }, routeContext) => {
  const totalStartedAt = performance.now();
  const { id } = await (routeContext as { params: Promise<{ id: string }> }).params;
  const key = cacheKey("market-detail", { id });
  const cacheLookupStartedAt = performance.now();
  const cached = getCached<ReturnType<typeof marketFromRow>>(key);
  const cacheLookupMs = elapsedMs(cacheLookupStartedAt);
  if (cached) {
    logApiTiming("market_detail.complete", {
      requestId,
      marketId: id,
      cache: "hit",
      found: true,
      cacheLookupMs,
      outcomeCount: cached.outcomes.length,
      tagCount: cached.tags.length,
      payloadBytes: Buffer.byteLength(JSON.stringify(cached)),
      totalMs: elapsedMs(totalStartedAt)
    });
    return ok(cached, requestId);
  }

  const databaseStartedAt = performance.now();
  const rows = await getSql().unsafe<MarketRow[]>(`${marketSelect} where m.id = $1::uuid and ${explorerValidMarket("m")} limit 1`, [id]);
  const databaseMs = elapsedMs(databaseStartedAt);
  const market = rows[0];
  if (!market) {
    logApiTiming("market_detail.complete", {
      requestId,
      marketId: id,
      cache: "miss",
      found: false,
      cacheLookupMs,
      databaseMs,
      totalMs: elapsedMs(totalStartedAt)
    });
    return fail("NOT_FOUND", "Market not found.", requestId, 404);
  }
  const transformationStartedAt = performance.now();
  const response = marketFromRow(market);
  const transformationMs = elapsedMs(transformationStartedAt);
  const serializationStartedAt = performance.now();
  const payloadBytes = Buffer.byteLength(JSON.stringify(response));
  const serializationMs = elapsedMs(serializationStartedAt);
  setCached(key, response, MARKET_DETAIL_CACHE_TTL_MS);
  logApiTiming("market_detail.complete", {
    requestId,
    marketId: id,
    cache: "miss",
    found: true,
    cacheLookupMs,
    databaseMs,
    outcomeCount: response.outcomes.length,
    tagCount: response.tags.length,
    transformationMs,
    serializationMs,
    payloadBytes,
    totalMs: elapsedMs(totalStartedAt)
  });
  return ok(response, requestId);
});
