import type { ProbisDatabase } from "@probis/database";
import { createAggregatesRepository } from "./aggregates";
import { createMarketsRepository } from "./markets";
import { createTimelineRepository } from "./timeline";
import { createTradesRepository } from "./trades";

export const createWorkerRepositories = (db: ProbisDatabase) => ({
  markets: createMarketsRepository(db),
  trades: createTradesRepository(db),
  aggregates: createAggregatesRepository(db),
  timeline: createTimelineRepository(db)
});
