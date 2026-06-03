import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { config as loadEnv } from "dotenv";
import { loadWorkerConfig } from "./config/env";
import { LifecycleReconciliationWorker } from "./lifecycle-reconciliation-worker";
import { MarketDiscoveryWorker } from "./market-discovery-worker";
import { createWorkerDatabase } from "./services/database";
import { MarketRepository } from "./services/market-repository";
import { PolymarketClient } from "./services/polymarket";

const packageEnvPath = resolve(process.cwd(), ".env");
const rootEnvPath = resolve(process.cwd(), "../..", ".env");
loadEnv({ path: rootEnvPath });
if (existsSync(packageEnvPath)) loadEnv({ path: packageEnvPath, override: true });

const config = loadWorkerConfig();
const { sql, close } = createWorkerDatabase(config);

try {
  const client = new PolymarketClient(config);
  const repository = new MarketRepository(sql, { relationshipSyncBatchSize: config.RELATIONSHIP_SYNC_BATCH_SIZE });
  const lifecycleReconciliation = new LifecycleReconciliationWorker(config, client, repository);
  await new MarketDiscoveryWorker(config, client, repository, lifecycleReconciliation).runOnce();
} finally {
  await close();
}
