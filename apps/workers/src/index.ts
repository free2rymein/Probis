import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { config as loadEnv } from "dotenv";
import { loadWorkerConfig } from "./config/env";
import { MarketDiscoveryService } from "./ingestion/market-discovery";
import { createIntelligenceConfig } from "./intelligence/config";
import { IntelligenceEngine } from "./intelligence/engine";
import { TradeIngestionWorker } from "./ingestion/trade-ingestion";
import { RealtimeEventBus } from "./realtime/event-bus";
import { createWorkerRepositories } from "./repositories";
import { createWorkerDatabase } from "./services/database";
import { createMockMarket } from "./services/mock-source";
import { logger } from "./utils/logger";

const packageEnvPath = resolve(process.cwd(), ".env");
const rootEnvPath = resolve(process.cwd(), "../..", ".env");

loadEnv({ path: rootEnvPath });

if (existsSync(packageEnvPath)) {
  loadEnv({ path: packageEnvPath, override: true });
}

const config = loadWorkerConfig();
const { db, close } = createWorkerDatabase(config);
const repositories = createWorkerRepositories(db);
const bus = new RealtimeEventBus();

bus.subscribe((event) => {
  if (event.type === "aggregate.flush") {
    logger.info("event_bus.aggregate_flush", { count: event.payload.count });
  }
});

if (config.WORKER_MODE === "mock") {
  await repositories.markets.upsertMany([createMockMarket()]);
}

const marketDiscovery = new MarketDiscoveryService(config, repositories);
const tradeIngestion = new TradeIngestionWorker(config, repositories, bus);
const intelligenceEngine = new IntelligenceEngine(
  createIntelligenceConfig(config),
  repositories.intelligence
);

const shutdown = async () => {
  logger.warn("workers.shutdown", {});
  marketDiscovery.stop();
  tradeIngestion.stop();
  intelligenceEngine.stop();
  await close();
  process.exit(0);
};

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());

logger.info("workers.start", {
  mode: config.WORKER_MODE,
  tradeBatchSize: config.TRADE_BATCH_SIZE,
  tradeFlushIntervalMs: config.TRADE_FLUSH_INTERVAL_MS,
  aggregateFlushIntervalMs: config.AGGREGATE_FLUSH_INTERVAL_MS,
  intelligenceEnabled: config.INTELLIGENCE_ENABLED,
  intelligenceIntervalMs: config.INTELLIGENCE_INTERVAL_MS
});

await Promise.all([marketDiscovery.run(), tradeIngestion.run(), intelligenceEngine.run()]);
