import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { config as loadEnv } from "dotenv";
import { loadWorkerConfig } from "./config/env";
import { createWorkerDatabase } from "./services/database";
import { ExplorerCardRepository } from "./services/explorer-card-repository";
import { MarketRepository } from "./services/market-repository";
import type { GammaEvent } from "./services/polymarket";
import { PolymarketClient } from "./services/polymarket";
import { StagingNormalizationService } from "./services/staging-normalization";
import { StagingRepository, type GammaFeedKind, type RawInsertStats } from "./services/staging-repository";
import { logger } from "./utils/logger";

const packageEnvPath = resolve(process.cwd(), ".env");
const rootEnvPath = resolve(process.cwd(), "../..", ".env");
loadEnv({ path: rootEnvPath });
if (existsSync(packageEnvPath)) loadEnv({ path: packageEnvPath, override: true });

const PIPELINE_STARTUP_LOCK_KEY = "probis_full_pipeline_startup_v1";
const PIPELINE_ACTIVE_WINDOW_MINUTES = 30;

type StagedFeedStats = {
  batchId: string;
  feedKind: GammaFeedKind;
  eventsFetched: number;
  marketsFetched: number;
  rawEvents: RawInsertStats;
  rawMarkets: RawInsertStats;
  fetchDurationMs: number;
  persistenceDurationMs: number;
  durationMs: number;
};

const flattenMarkets = (events: GammaEvent[]) =>
  events.flatMap((event) => (event.markets ?? []).map((market) => ({
    externalEventId: event.id ?? null,
    market
  })));

const stageFeed = async (
  repository: StagingRepository,
  feedKind: GammaFeedKind,
  fetchEvents: () => Promise<GammaEvent[]>
): Promise<StagedFeedStats> => {
  const startedAt = Date.now();
  const batchId = await repository.createGammaIngestionBatch({
    feedKind,
    metadata: { mode: "stage-normalize", command: "pipeline:once" }
  });
  logger.info("full_pipeline.staging_feed.start", { batchId, feedKind });
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
      timings: { fetchDurationMs, persistenceDurationMs, durationMs }
    });
    const stats = {
      batchId,
      feedKind,
      eventsFetched: events.length,
      marketsFetched: markets.length,
      rawEvents,
      rawMarkets,
      fetchDurationMs,
      persistenceDurationMs,
      durationMs
    };
    logger.info("full_pipeline.staging_feed.complete", {
      batchId,
      feedKind,
      eventsFetched: events.length,
      marketsFetched: markets.length,
      rawEventRowsInserted: rawEvents.inserted,
      rawEventRowsSkipped: rawEvents.skipped,
      rawMarketRowsInserted: rawMarkets.inserted,
      rawMarketRowsSkipped: rawMarkets.skipped,
      fetchDurationMs,
      persistenceDurationMs,
      durationMs
    });
    return stats;
  } catch (error: unknown) {
    await repository.markBatchFailed(batchId, error);
    logger.error("full_pipeline.staging_feed.failed", {
      batchId,
      feedKind,
      message: error instanceof Error ? error.message : String(error),
      durationMs: Date.now() - startedAt
    });
    throw error;
  }
};

const config = loadWorkerConfig();
const { sql, close } = createWorkerDatabase(config, { max: 1, disableIdleTimeout: true });
let pipelineRunId: string | null = null;

try {
  pipelineRunId = await sql.begin(async (transaction) => {
    const [startupLock] = await transaction<{ acquired: boolean }[]>`
      select pg_try_advisory_xact_lock(hashtext(${PIPELINE_STARTUP_LOCK_KEY})) as acquired
    `;
    if (!startupLock?.acquired) throw new Error("Another full pipeline run is starting");
    const [run] = await transaction<{ id: string }[]>`
      insert into gamma_ingestion_batches (feed_kind, status, metadata)
      select 'full_pipeline', 'started', ${transaction.json({
        command: "pipeline:once",
        normalizationMode: "stage-normalize"
      })}
      where not exists (
        select 1
        from gamma_ingestion_batches
        where feed_kind = 'full_pipeline'
          and status = 'started'
          and started_at >= now() - (${PIPELINE_ACTIVE_WINDOW_MINUTES} * interval '1 minute')
      )
      returning id
    `;
    if (!run) throw new Error("Another full pipeline run is already active");
    return run.id;
  });

  const startedAt = Date.now();
  logger.info("full_pipeline.start", {
    pipelineRunId,
    normalizationMode: "stage-normalize",
    configuredDefaultIngestionMode: config.GAMMA_INGESTION_MODE
  });

  const client = new PolymarketClient(config);
  const staging = new StagingRepository(sql);

  const stagingStartedAt = Date.now();
  logger.info("full_pipeline.staging_refresh.start", {});
  const openFeed = await stageFeed(staging, "open_events", () => client.fetchActiveEvents());
  const closedFeed = await stageFeed(staging, "closed_events", () => client.fetchClosedEvents());
  logger.info("full_pipeline.staging_refresh.complete", {
    openBatchId: openFeed.batchId,
    closedBatchId: closedFeed.batchId,
    rawOpenEvents: openFeed.rawEvents.inserted,
    rawOpenMarkets: openFeed.rawMarkets.inserted,
    rawClosedEvents: closedFeed.rawEvents.inserted,
    rawClosedMarkets: closedFeed.rawMarkets.inserted,
    durationMs: Date.now() - stagingStartedAt
  });

  const normalizationStartedAt = Date.now();
  logger.info("full_pipeline.staging_normalization.start", {
    batchId: openFeed.batchId,
    normalizationMode: "stage-normalize"
  });
  const normalization = await new StagingNormalizationService(sql, new MarketRepository(sql))
    .normalizeLatestOpenEvents(openFeed.batchId);
  logger.info("full_pipeline.staging_normalization.complete", {
    ...normalization,
    durationMs: Date.now() - normalizationStartedAt
  });

  const cardRefreshStartedAt = Date.now();
  logger.info("full_pipeline.explorer_cards_refresh.start", {});
  const cards = await new ExplorerCardRepository(sql, config).refresh();
  logger.info("full_pipeline.explorer_cards_refresh.complete", {
    ...cards,
    durationMs: Date.now() - cardRefreshStartedAt
  });

  const cleanupStartedAt = Date.now();
  const cleanupMode = config.RAW_STAGING_CLEANUP_MODE;
  logger.info("full_pipeline.staging_cleanup.start", { cleanupMode });
  if (cleanupMode === "truncate-after-success") {
    logger.warn("full_pipeline.staging_cleanup.truncate_after_success", {
      cleanupMode,
      batchMetadataRetained: true,
      rawDebugPayloadsRemoved: true,
      message: "Raw Gamma staging payloads will be removed after successful explorer card refresh."
    });
  }
  const cleanup = cleanupMode === "truncate-after-success"
    ? await staging.truncateRawStaging()
    : await staging.cleanupRawStaging({
      keepSuccessfulBatches: config.RAW_STAGING_KEEP_SUCCESSFUL_BATCHES,
      failedRetentionMinutes: config.RAW_FAILED_STAGING_RETENTION_MINUTES,
      otherRetentionMinutes: config.RAW_STAGING_RETENTION_MINUTES
    });
  logger.info("full_pipeline.staging_cleanup.complete", {
    ...cleanup,
    cleanupMode,
    cleanupOperation: cleanupMode === "truncate-after-success" ? "truncate" : "retain-latest",
    batchMetadataRetained: true,
    rawDebugPayloadsRemoved: cleanupMode === "truncate-after-success",
    durationMs: Date.now() - cleanupStartedAt
  });

  await sql`
    update gamma_ingestion_batches set
      status = 'normalized',
      normalized_at = now(),
      completed_at = now()
    where id = ${pipelineRunId}
  `;
  logger.info("full_pipeline.complete", {
    pipelineRunId,
    openBatchId: openFeed.batchId,
    closedBatchId: closedFeed.batchId,
    rawOpenEvents: openFeed.rawEvents.inserted,
    rawOpenMarkets: openFeed.rawMarkets.inserted,
    normalizedEvents: normalization.normalizedEvents,
    normalizedMarkets: normalization.normalizedMarkets,
    excludedEvents: normalization.excludedEvents,
    excludedMarkets: normalization.excludedMarkets,
    cardsBuilt: cards.cardsBuilt,
    visibleCards: cards.visibleCards,
    cleanupMode,
    rawEventsDeleted: cleanup.rawEventsDeleted,
    rawMarketsDeleted: cleanup.rawMarketsDeleted,
    durationMs: Date.now() - startedAt
  });
} catch (error: unknown) {
  if (pipelineRunId) {
    try {
      await sql`
        update gamma_ingestion_batches set
          status = 'failed',
          completed_at = now(),
          error_message = ${error instanceof Error ? error.message : String(error)}
        where id = ${pipelineRunId}
      `;
    } catch (statusError: unknown) {
      logger.warn("full_pipeline.status_update.failed", {
        pipelineRunId,
        message: statusError instanceof Error ? statusError.message : String(statusError)
      });
    }
  }
  logger.error("full_pipeline.failed", {
    pipelineRunId,
    message: error instanceof Error ? error.message : String(error)
  });
  throw error;
} finally {
  await close();
}
