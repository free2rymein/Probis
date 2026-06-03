import type postgres from "postgres";
import { queryExplorerCardCategories } from "@/lib/explorer-card-categories-query";
import { inspectExplorerCardReadModel } from "@/lib/explorer-card-read-model-query";
import type { EventsQueryMode } from "@/lib/events-query-mode";
import { queryLegacyCategories, type CategoriesQueryResult } from "@/lib/legacy-categories-query";
import type { CategoriesQuery } from "@/lib/query";

type CategoriesQueryDependencies = {
  inspectReadModel: typeof inspectExplorerCardReadModel;
  queryLegacy: typeof queryLegacyCategories;
  queryReadModel: typeof queryExplorerCardCategories;
};

export type CategoriesQueryRunResult = {
  result: CategoriesQueryResult;
  queryPath: "legacy" | "read-model";
  fallbackReason: string | null;
  healthCheckMs: number | null;
};

const defaultDependencies: CategoriesQueryDependencies = {
  inspectReadModel: inspectExplorerCardReadModel,
  queryLegacy: queryLegacyCategories,
  queryReadModel: queryExplorerCardCategories
};

export const runCategoriesQuery = async (
  sql: postgres.Sql,
  query: CategoriesQuery,
  queryMode: EventsQueryMode,
  dependencies: CategoriesQueryDependencies = defaultDependencies
): Promise<CategoriesQueryRunResult> => {
  if (queryMode === "legacy") {
    return {
      result: await dependencies.queryLegacy(sql, query),
      queryPath: "legacy",
      fallbackReason: null,
      healthCheckMs: null
    };
  }
  let healthCheckMs: number | null = null;
  try {
    const health = await dependencies.inspectReadModel(sql);
    healthCheckMs = health.durationMs;
    if (!health.usable) throw new Error(health.reason ?? "read_model_unusable");
    return {
      result: await dependencies.queryReadModel(sql, query),
      queryPath: "read-model",
      fallbackReason: null,
      healthCheckMs
    };
  } catch (error: unknown) {
    if (queryMode === "read-model") throw error;
    return {
      result: await dependencies.queryLegacy(sql, query),
      queryPath: "legacy",
      fallbackReason: error instanceof Error ? error.message : String(error),
      healthCheckMs
    };
  }
};
