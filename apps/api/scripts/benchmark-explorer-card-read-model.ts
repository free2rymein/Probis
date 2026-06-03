import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import postgres from "postgres";
import { inspectExplorerCardReadModel, queryExplorerCardReadModel } from "../lib/explorer-card-read-model-query";
import { eventsQuerySchema } from "../lib/query";
import { cacheKey, getCached, setCached } from "../lib/server-cache";

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

const sql = postgres(process.env.DATABASE_URL, {
  max: 1,
  prepare: false,
  idle_timeout: 20,
  connect_timeout: 10
});

const scenarios = [
  { name: "default trending cache miss", query: eventsQuerySchema.parse({ venue: "polymarket" }) },
  { name: "search iran cache miss", query: eventsQuerySchema.parse({ venue: "polymarket", search: "iran" }) },
  { name: "sports category cache miss", query: eventsQuerySchema.parse({ venue: "polymarket", category: "sports" }) }
];

try {
  const health = await inspectExplorerCardReadModel(sql);
  console.warn({ name: "health cold", durationMs: health.durationMs, usable: health.usable });
  console.warn({ name: "health cached", durationMs: (await inspectExplorerCardReadModel(sql)).durationMs });

  for (const scenario of scenarios) {
    const durations = [];
    for (let iteration = 0; iteration < 3; iteration += 1) {
      const startedAt = performance.now();
      const result = await queryExplorerCardReadModel(sql, scenario.query);
      durations.push(Number((performance.now() - startedAt).toFixed(1)));
      if (iteration === 0) {
        console.warn({
          name: scenario.name,
          items: result.response.items.length,
          total: result.response.pagination.total,
          databaseMs: result.databaseMs
        });
      }
    }
    console.warn({
      name: `${scenario.name} samples`,
      durationsMs: durations,
      bestMs: Math.min(...durations)
    });
  }

  const key = cacheKey("benchmark-events", scenarios[0]?.query);
  setCached(key, { items: scenarios[0]?.name });
  const cacheStartedAt = performance.now();
  getCached(key);
  console.warn({ name: "response cache hit", totalMs: Number((performance.now() - cacheStartedAt).toFixed(3)) });
} finally {
  await sql.end();
}
