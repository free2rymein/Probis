import type { ProbisDatabase } from "../client";
import { createAnomalyRepository } from "./anomalies";
import { createMarketsRepository } from "./markets";
import { createTradesRepository } from "./trades";
import { createWalletRepository } from "./wallets";

export const createRepositories = (db: ProbisDatabase) => ({
  markets: createMarketsRepository({ db }),
  trades: createTradesRepository({ db }),
  wallets: createWalletRepository({ db }),
  anomalies: createAnomalyRepository({ db })
});

export * from "./anomalies";
export * from "./markets";
export * from "./trades";
export * from "./wallets";
