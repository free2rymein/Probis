import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { config as loadEnv } from "dotenv";
import { loadWorkerConfig } from "./config/env";
import { createWorkerDatabase } from "./services/database";
import { MarketRepository } from "./services/market-repository";
import { StagingNormalizationService } from "./services/staging-normalization";
import { logger } from "./utils/logger";

const packageEnvPath = resolve(process.cwd(), ".env");
const rootEnvPath = resolve(process.cwd(), "../..", ".env");
loadEnv({ path: rootEnvPath });
if (existsSync(packageEnvPath)) loadEnv({ path: packageEnvPath, override: true });

const config = loadWorkerConfig();
if (config.GAMMA_INGESTION_MODE !== "stage-normalize") {
  throw new Error("Set GAMMA_INGESTION_MODE=stage-normalize to run staged normalization");
}

const batchIdArgumentIndex = process.argv.indexOf("--batch-id");
const batchId = batchIdArgumentIndex >= 0 ? process.argv[batchIdArgumentIndex + 1] : process.env.GAMMA_STAGING_BATCH_ID;
if (batchIdArgumentIndex >= 0 && !batchId) throw new Error("--batch-id requires a value");

const { sql, close } = createWorkerDatabase(config);

try {
  const service = new StagingNormalizationService(sql, new MarketRepository(sql));
  const stats = await service.normalizeLatestOpenEvents(batchId);
  logger.info("staging_normalization.complete", {
    ...stats,
    status: "normalized"
  });
} finally {
  await close();
}
