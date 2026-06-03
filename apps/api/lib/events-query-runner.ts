import type postgres from "postgres";
import { inspectExplorerCardReadModel, queryExplorerCardReadModel } from "@/lib/explorer-card-read-model-query";
import type { EventsQueryMode } from "@/lib/events-query-mode";
import { queryLegacyEvents, type EventsQueryResult } from "@/lib/legacy-event-query";
import type { EventsQuery } from "@/lib/query";

type EventsQueryDependencies = {
  inspectReadModel: typeof inspectExplorerCardReadModel;
  queryLegacy: typeof queryLegacyEvents;
  queryReadModel: typeof queryExplorerCardReadModel;
};

export type EventsQueryRunResult = {
  result: EventsQueryResult;
  queryPath: "legacy" | "read-model";
  fallbackReason: string | null;
  healthCheckMs: number | null;
};

const defaultDependencies: EventsQueryDependencies = {
  inspectReadModel: inspectExplorerCardReadModel,
  queryLegacy: queryLegacyEvents,
  queryReadModel: queryExplorerCardReadModel
};

export const runEventsQuery = async (
  sql: postgres.Sql,
  query: EventsQuery,
  queryMode: EventsQueryMode,
  dependencies: EventsQueryDependencies = defaultDependencies
): Promise<EventsQueryRunResult> => {
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
