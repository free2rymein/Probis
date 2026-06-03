import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { config as loadEnv } from "dotenv";
import { loadWorkerConfig } from "./config/env";
import { LifecycleReconciliationWorker } from "./lifecycle-reconciliation-worker";
import { MarketDiscoveryWorker } from "./market-discovery-worker";
import { MarketSnapshotWorker } from "./market-snapshot-worker";
import { createWorkerDatabase } from "./services/database";
import { MarketRepository } from "./services/market-repository";
import { PolymarketClient } from "./services/polymarket";
import { logger } from "./utils/logger";

const packageEnvPath = resolve(process.cwd(), ".env");
const rootEnvPath = resolve(process.cwd(), "../..", ".env");
loadEnv({ path: rootEnvPath });
if (existsSync(packageEnvPath)) loadEnv({ path: packageEnvPath, override: true });

const config = loadWorkerConfig();
const { sql, close } = createWorkerDatabase(config);
const client = new PolymarketClient(config);
const repository = new MarketRepository(sql);
const lifecycleReconciliation = new LifecycleReconciliationWorker(config, client, repository);
const discovery = new MarketDiscoveryWorker(config, client, repository, lifecycleReconciliation);
const snapshots = new MarketSnapshotWorker(config, client, repository);

const shutdown = async () => {
  logger.warn("workers.shutdown", {});
  discovery.stop();
  snapshots.stop();
  await close();
  process.exit(0);
};

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());

logger.info("workers.start", {
  marketDiscoveryIntervalMs: config.MARKET_DISCOVERY_INTERVAL_MS,
  marketSnapshotIntervalMs: config.MARKET_SNAPSHOT_INTERVAL_MS
});

discovery.start();
snapshots.start();
