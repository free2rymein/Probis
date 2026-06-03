import type { ProbisDatabase } from "@probis/database";
import { createAggregatesRepository } from "./aggregates";
import { createMarketsRepository } from "./markets";
import { createTimelineRepository } from "./timeline";
import { createTradesRepository } from "./trades";
import { createSystemStatusRepository } from "./system-status";
import { createIntelligenceRepository } from "../intelligence/repositories/intelligence-repository";
import { createWalletIntelligenceRepository } from "../wallet-intelligence/repositories/wallet-repository";

export const createWorkerRepositories = (db: ProbisDatabase) => ({
  markets: createMarketsRepository(db),
  trades: createTradesRepository(db),
  aggregates: createAggregatesRepository(db),
  timeline: createTimelineRepository(db),
  systemStatus: createSystemStatusRepository(db),
  intelligence: createIntelligenceRepository(db),
  walletIntelligence: createWalletIntelligenceRepository(db)
});
