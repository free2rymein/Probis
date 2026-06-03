import { getSql } from "@/lib/db";
import { getEventsQueryMode } from "@/lib/events-query-mode";
import { withApiHandler } from "@/lib/handler";
import { ok } from "@/lib/responses";
import { elapsedMs, logApiTiming } from "@/lib/timing";

export const GET = withApiHandler(async (_request, { requestId }) => {
  const startedAt = performance.now();
  const queryMode = getEventsQueryMode();
  const [ping] = await getSql()<[{ ok: number }]>`select 1::int as ok`;
  const health = {
    status: ping?.ok === 1 ? "ok" : "warning",
    service: "probis-api",
    schema: "probis2_foundation",
    timestamp: new Date().toISOString(),
    database: {
      status: ping?.ok === 1 ? "ok" : "unknown"
    },
    queryMode
  };
  logApiTiming("health.complete", {
    requestId,
    queryMode,
    databaseStatus: health.database.status,
    totalMs: elapsedMs(startedAt)
  });
  return ok(health, requestId);
});
