import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import postgres from "postgres";
import { inspectExplorerCardReadModel } from "../lib/explorer-card-read-model-query";
import { runEventsQuery } from "../lib/events-query-runner";
import { eventsQuerySchema } from "../lib/query";

const loadEnvFile = (path: string) => {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    const key = match?.[1];
    const value = match?.[2];
    if (!key || value === undefined || process.env[key]) continue;
    process.env[key] = value.trim().replace(/^"(.*)"$/, "$1");
  }
};

loadEnvFile(resolve(process.cwd(), "../..", ".env"));
loadEnvFile(resolve(process.cwd(), ".env.local"));

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");

const sql = postgres(process.env.DATABASE_URL, { max: 3, prepare: false, idle_timeout: 20, connect_timeout: 10 });
const query = eventsQuerySchema.parse({});

try {
  for (const queryMode of ["legacy", "read-model", "read-model-with-legacy-fallback"] as const) {
    const startedAt = performance.now();
    const result = await runEventsQuery(sql, query, queryMode);
    console.warn({
      queryMode,
      queryPath: result.queryPath,
      fallbackReason: result.fallbackReason,
      items: result.result.response.items.length,
      total: result.result.response.pagination.total,
      countQueryMs: result.result.countQueryMs,
      cardQueryMs: result.result.cardQueryMs,
      databaseMs: result.result.databaseMs,
      totalMs: Number((performance.now() - startedAt).toFixed(1))
    });
  }

  const startedAt = performance.now();
  const fallback = await runEventsQuery(sql, query, "read-model-with-legacy-fallback", {
    inspectReadModel: async (client) => ({
      ...await inspectExplorerCardReadModel(client),
      usable: false,
      reason: "smoke_injected_read_model_failure"
    }),
    queryLegacy: async (client, input) => (await import("../lib/legacy-event-query")).queryLegacyEvents(client, input),
    queryReadModel: async () => {
      throw new Error("read-model query should not execute after failed health check");
    }
  });
  console.warn({
    queryMode: "read-model-with-legacy-fallback",
    queryPath: fallback.queryPath,
    fallbackReason: fallback.fallbackReason,
    items: fallback.result.response.items.length,
    total: fallback.result.response.pagination.total,
    totalMs: Number((performance.now() - startedAt).toFixed(1))
  });
} finally {
  await sql.end();
}
