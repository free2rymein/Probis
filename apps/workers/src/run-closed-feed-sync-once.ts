import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { config as loadEnv } from "dotenv";
import { loadWorkerConfig } from "./config/env";
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

try {
  const startedAt = Date.now();
  const client = new PolymarketClient(config);
  const repository = new MarketRepository(sql);
  const closedEvents = await client.fetchClosedEvents();
  const stats = await repository.syncClosedEvents(closedEvents);
  logger.info("closed_feed_sync.complete", { ...stats, totalDurationMs: Date.now() - startedAt });
} finally {
  await close();
}
