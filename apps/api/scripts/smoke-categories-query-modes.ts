import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import postgres from "postgres";
import { runCategoriesQuery } from "../lib/categories-query-runner";
import { queryLegacyCategories } from "../lib/legacy-categories-query";
import { inspectExplorerCardReadModel } from "../lib/explorer-card-read-model-query";
import { categoriesQuerySchema } from "../lib/query";

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
const query = categoriesQuerySchema.parse({});

try {
  for (const queryMode of ["legacy", "read-model", "read-model-with-legacy-fallback"] as const) {
    const startedAt = performance.now();
    const result = await runCategoriesQuery(sql, query, queryMode);
    console.warn({
      queryMode,
      queryPath: result.queryPath,
      fallbackReason: result.fallbackReason,
      categories: result.result.response.length,
      visibleEvents: result.result.response.reduce((sum, category) => sum + category.eventCount, 0),
      categoryQueryMs: result.result.categoryQueryMs,
      totalMs: Number((performance.now() - startedAt).toFixed(1))
    });
  }

  const startedAt = performance.now();
  const fallback = await runCategoriesQuery(sql, query, "read-model-with-legacy-fallback", {
    inspectReadModel: async (client) => ({
      ...await inspectExplorerCardReadModel(client),
      usable: false,
      reason: "smoke_injected_read_model_failure"
    }),
    queryLegacy: queryLegacyCategories,
    queryReadModel: async () => {
      throw new Error("read-model query should not execute after failed health check");
    }
  });
  console.warn({
    queryMode: "read-model-with-legacy-fallback",
    queryPath: fallback.queryPath,
    fallbackReason: fallback.fallbackReason,
    categories: fallback.result.response.length,
    totalMs: Number((performance.now() - startedAt).toFixed(1))
  });

  const visibleCards = await sql<{ category_slug: string; visible_cards: number }[]>`
    select category_slug, count(*)::int as visible_cards
    from explorer_event_cards
    where is_explorer_visible = true
    group by category_slug
    order by category_slug
  `;
  const readModel = await runCategoriesQuery(sql, query, "read-model");
  const responseCounts = new Map(readModel.result.response.map((category) => [category.slug, category.eventCount]));
  const mismatches = visibleCards.flatMap((row) =>
    responseCounts.get(row.category_slug) === row.visible_cards
      ? []
      : [{ slug: row.category_slug, cards: row.visible_cards, categoriesApi: responseCounts.get(row.category_slug) ?? null }]
  );
  console.warn({ consistency: mismatches.length === 0 ? "PASS" : "FAIL", visibleCards, mismatches });
  if (mismatches.length > 0) process.exitCode = 1;
} finally {
  await sql.end();
}
