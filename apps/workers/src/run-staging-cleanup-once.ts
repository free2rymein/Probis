import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { config as loadEnv } from "dotenv";
import { loadWorkerConfig } from "./config/env";
import { createWorkerDatabase } from "./services/database";
import { StagingRepository } from "./services/staging-repository";
import { logger } from "./utils/logger";

const packageEnvPath = resolve(process.cwd(), ".env");
const rootEnvPath = resolve(process.cwd(), "../..", ".env");
loadEnv({ path: rootEnvPath });
if (existsSync(packageEnvPath)) loadEnv({ path: packageEnvPath, override: true });

const config = loadWorkerConfig();
const { sql, close } = createWorkerDatabase(config);

try {
  const startedAt = Date.now();
  const repository = new StagingRepository(sql);
  const stats = await repository.cleanupRawStaging({
    keepSuccessfulBatches: config.RAW_STAGING_KEEP_SUCCESSFUL_BATCHES,
    failedRetentionMinutes: config.RAW_FAILED_STAGING_RETENTION_MINUTES,
    otherRetentionMinutes: config.RAW_STAGING_RETENTION_MINUTES
  });
  logger.info("staging_cleanup.complete", {
    keepSuccessfulBatches: config.RAW_STAGING_KEEP_SUCCESSFUL_BATCHES,
    failedRetentionMinutes: config.RAW_FAILED_STAGING_RETENTION_MINUTES,
    otherRetentionMinutes: config.RAW_STAGING_RETENTION_MINUTES,
    ...stats,
    durationMs: Date.now() - startedAt
  });
} finally {
  await close();
}
