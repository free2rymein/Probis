import type { MarketHistoryPoint } from "@probis/types";
import { getSql } from "@/lib/db";
import { withApiHandler } from "@/lib/handler";
import { historyQuerySchema, queryObject } from "@/lib/query";
import { ok } from "@/lib/responses";
import { cacheKey, getCached, setCached } from "@/lib/server-cache";
import { elapsedMs, logApiTiming } from "@/lib/timing";

const numeric = (value: string | null) => (value === null ? null : Number(value));
// In-process cache for local/single-instance deployments. History is snapshot
// based, so a slightly longer TTL avoids repeat pooler round-trips while staying fresh.
const MARKET_HISTORY_CACHE_TTL_MS = 120_000;

export const GET = withApiHandler(async (request, { requestId }, routeContext) => {
  const totalStartedAt = performance.now();
  const { id } = await (routeContext as { params: Promise<{ id: string }> }).params;
  const query = historyQuerySchema.parse(queryObject(request));
  const key = cacheKey("market-history", {
    id,
    limit: query.limit,
    from: query.from?.toISOString() ?? null,
    to: query.to?.toISOString() ?? null
  });
  const cacheLookupStartedAt = performance.now();
  const cached = getCached<MarketHistoryPoint[]>(key);
  const cacheLookupMs = elapsedMs(cacheLookupStartedAt);
  if (cached) {
    logApiTiming("market_history.complete", {
      requestId,
      marketId: id,
      cache: "hit",
      requestedLimit: query.limit,
      returnedRows: cached.length,
      cacheLookupMs,
      payloadBytes: Buffer.byteLength(JSON.stringify(cached)),
      totalMs: elapsedMs(totalStartedAt)
    });
    return ok(cached, requestId);
  }

  const databaseStartedAt = performance.now();
  const rows = await getSql()<Array<{ id: string; market_id: string; snapshot_time: Date; probability: string | null; volume: string | null; liquidity: string | null; open_interest: string | null }>>`
    select id, market_id, snapshot_time, probability::text, volume::text, liquidity::text, open_interest::text
    from market_snapshots
    where market_id = ${id}::uuid
      and (${query.from ?? null}::timestamptz is null or snapshot_time >= ${query.from ?? null})
      and (${query.to ?? null}::timestamptz is null or snapshot_time <= ${query.to ?? null})
    order by snapshot_time desc
    limit ${query.limit}
  `;
  const databaseMs = elapsedMs(databaseStartedAt);
  const transformationStartedAt = performance.now();
  const history: MarketHistoryPoint[] = rows.reverse().map((row) => ({
    id: row.id, marketId: row.market_id, snapshotTime: row.snapshot_time.toISOString(),
    probability: numeric(row.probability), volume: numeric(row.volume), liquidity: numeric(row.liquidity),
    openInterest: numeric(row.open_interest)
  }));
  const transformationMs = elapsedMs(transformationStartedAt);
  const serializationStartedAt = performance.now();
  const payloadBytes = Buffer.byteLength(JSON.stringify(history));
  const serializationMs = elapsedMs(serializationStartedAt);
  setCached(key, history, MARKET_HISTORY_CACHE_TTL_MS);
  logApiTiming("market_history.complete", {
    requestId,
    marketId: id,
    cache: "miss",
    requestedLimit: query.limit,
    returnedRows: history.length,
    cacheLookupMs,
    databaseMs,
    transformationMs,
    serializationMs,
    payloadBytes,
    totalMs: elapsedMs(totalStartedAt)
  });
  return ok(history, requestId);
});
