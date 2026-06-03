import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { config as loadEnv } from "dotenv";
import { loadWorkerConfig } from "./config/env";
import { createWorkerDatabase } from "./services/database";
import type { GammaEvent } from "./services/polymarket";
import { PolymarketClient } from "./services/polymarket";
import { StagingRepository, type GammaFeedKind } from "./services/staging-repository";
import { logger } from "./utils/logger";

const packageEnvPath = resolve(process.cwd(), ".env");
const rootEnvPath = resolve(process.cwd(), "../..", ".env");
loadEnv({ path: rootEnvPath });
if (existsSync(packageEnvPath)) loadEnv({ path: packageEnvPath, override: true });

const config = loadWorkerConfig();
const { sql, close } = createWorkerDatabase(config);

const flattenMarkets = (events: GammaEvent[]) =>
  events.flatMap((event) => (event.markets ?? []).map((market) => ({
    externalEventId: event.id ?? null,
    market
  })));

const stageFeed = async (
  repository: StagingRepository,
  feedKind: GammaFeedKind,
  fetchEvents: () => Promise<GammaEvent[]>
) => {
  const startedAt = Date.now();
  const batchId = await repository.createGammaIngestionBatch({
    feedKind,
    metadata: { mode: "shadow", command: "staging:refresh" }
  });
  try {
    const fetchStartedAt = Date.now();
    const events = await fetchEvents();
    const fetchDurationMs = Date.now() - fetchStartedAt;
    const markets = flattenMarkets(events);
    const persistenceStartedAt = Date.now();
    const [rawEvents, rawMarkets] = await Promise.all([
      repository.insertRawEvents(batchId, feedKind, events),
      repository.insertRawMarkets(batchId, feedKind, markets)
    ]);
    const persistenceDurationMs = Date.now() - persistenceStartedAt;
    const durationMs = Date.now() - startedAt;
    await repository.markBatchFetched(batchId, {
      eventCount: events.length,
      marketCount: markets.length,
      timings: {
        fetchDurationMs,
        rawStagingWritePageSize: config.RAW_STAGING_WRITE_PAGE_SIZE,
        persistenceDurationMs,
        durationMs
      }
    });
    const cleanup = await repository.cleanupRawStaging({
      keepSuccessfulBatches: config.RAW_STAGING_KEEP_SUCCESSFUL_BATCHES,
      failedRetentionMinutes: config.RAW_FAILED_STAGING_RETENTION_MINUTES,
      otherRetentionMinutes: config.RAW_STAGING_RETENTION_MINUTES
    });
    logger.info("staging_refresh.complete", {
      batchId,
      feedKind,
      eventsFetched: events.length,
      marketsFetched: markets.length,
      rawEventRowsInserted: rawEvents.inserted,
      rawEventRowsSkipped: rawEvents.skipped,
      rawMarketRowsInserted: rawMarkets.inserted,
      rawMarketRowsSkipped: rawMarkets.skipped,
      rawStagingWritePageSize: config.RAW_STAGING_WRITE_PAGE_SIZE,
      cleanupRawEventRowsDeleted: cleanup.rawEventsDeleted,
      cleanupRawMarketRowsDeleted: cleanup.rawMarketsDeleted,
      cleanupAffectedBatches: cleanup.affectedBatches,
      durationMs,
      status: "fetched"
    });
  } catch (error: unknown) {
    await repository.markBatchFailed(batchId, error);
    logger.error("staging_refresh.failed", {
      batchId,
      feedKind,
      message: error instanceof Error ? error.message : String(error),
      durationMs: Date.now() - startedAt,
      status: "failed"
    });
    throw error;
  }
};

try {
  const client = new PolymarketClient(config);
  const repository = new StagingRepository(sql, {
    readPageSize: config.RAW_STAGING_READ_PAGE_SIZE,
    writePageSize: config.RAW_STAGING_WRITE_PAGE_SIZE,
    statusUpdateBatchSize: config.RAW_STAGING_STATUS_UPDATE_BATCH_SIZE
  });
  await stageFeed(repository, "open_events", () => client.fetchActiveEvents());
  await stageFeed(repository, "closed_events", () => client.fetchClosedEvents());
} finally {
  await close();
}
