import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { config as loadEnv } from "dotenv";
import { loadWorkerConfig } from "./config/env";
import { createWorkerDatabase } from "./services/database";
import { ExplorerCardRepository } from "./services/explorer-card-repository";
import { MarketRepository } from "./services/market-repository";
import type { GammaEvent } from "./services/polymarket";
import { PolymarketClient } from "./services/polymarket";
import { StagingNormalizationService, type StagingNormalizationStats } from "./services/staging-normalization";
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
  events: GammaEvent[];
  eventsFetched: number;
  marketsFetched: number;
  rawEvents: RawInsertStats;
  rawMarkets: RawInsertStats;
  fetchDurationMs: number;
  rawEventInsertDurationMs: number;
  rawMarketInsertDurationMs: number;
  writePageSize: number;
  persistenceDurationMs: number;
  durationMs: number;
};

type StoredProcedureSummary = {
  events_seen?: number;
  events_upserted?: number;
  events_excluded?: number;
  markets_seen?: number;
  markets_upserted?: number;
  markets_excluded?: number;
  outcomes_upserted?: number;
  event_markets_upserted?: number;
  market_categories_upserted?: number;
  event_tags_upserted?: number;
  market_tags_upserted?: number;
  duration_ms?: number;
  limitation_notes?: string[];
};

type StoredProcedureClosedLifecycleSummary = {
  closed_events_seen?: number;
  closed_markets_seen?: number;
  events_matched?: number;
  markets_matched?: number;
  events_closed?: number;
  events_archived?: number;
  markets_closed?: number;
  markets_archived?: number;
  markets_resolved?: number;
  markets_automatically_resolved?: number;
  markets_final_period_ft?: number;
  markets_finished_timestamp?: number;
  markets_closed_time_set?: number;
  markets_lifecycle_updated?: number;
  duration_ms?: number;
  limitation_notes?: string[];
};

const flattenMarkets = (events: GammaEvent[]) =>
  events.flatMap((event) => (event.markets ?? []).map((market) => ({
    externalEventId: event.id ?? null,
    market
  })));

const stageFeed = async (
  repository: StagingRepository,
  writePageSize: number,
  feedKind: GammaFeedKind,
  fetchEvents: () => Promise<GammaEvent[]>
): Promise<StagedFeedStats> => {
  const startedAt = Date.now();
  const batchId = await repository.createGammaIngestionBatch({
    feedKind,
    metadata: {
      mode: "stage-normalize",
      command: "pipeline:once",
      normalizationSource: config.PIPELINE_NORMALIZATION_SOURCE
    }
  });
  logger.info("full_pipeline.staging_feed.start", { batchId, feedKind });
  try {
    const fetchStartedAt = Date.now();
    const events = await fetchEvents();
    const fetchDurationMs = Date.now() - fetchStartedAt;
    const markets = flattenMarkets(events);
    const persistenceStartedAt = Date.now();
    let rawEventInsertDurationMs = 0;
    let rawMarketInsertDurationMs = 0;
    const [rawEvents, rawMarkets] = await Promise.all([
      (async () => {
        const startedAt = Date.now();
        try {
          return await repository.insertRawEvents(batchId, feedKind, events);
        } finally {
          rawEventInsertDurationMs = Date.now() - startedAt;
        }
      })(),
      (async () => {
        const startedAt = Date.now();
        try {
          return await repository.insertRawMarkets(batchId, feedKind, markets);
        } finally {
          rawMarketInsertDurationMs = Date.now() - startedAt;
        }
      })()
    ]);
    const persistenceDurationMs = Date.now() - persistenceStartedAt;
    const durationMs = Date.now() - startedAt;
    await repository.markBatchFetched(batchId, {
      eventCount: events.length,
      marketCount: markets.length,
      timings: { fetchDurationMs, rawEventInsertDurationMs, rawMarketInsertDurationMs, writePageSize, persistenceDurationMs, durationMs }
    });
    const stats = {
      batchId,
      feedKind,
      events,
      eventsFetched: events.length,
      marketsFetched: markets.length,
      rawEvents,
      rawMarkets,
      fetchDurationMs,
      rawEventInsertDurationMs,
      rawMarketInsertDurationMs,
      writePageSize,
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
      rawEventInsertDurationMs,
      rawMarketInsertDurationMs,
      writePageSize,
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
        normalizationMode: "stage-normalize",
        normalizationSource: config.PIPELINE_NORMALIZATION_SOURCE
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
    normalizationSource: config.PIPELINE_NORMALIZATION_SOURCE,
    configuredDefaultIngestionMode: config.GAMMA_INGESTION_MODE
  });

  const client = new PolymarketClient(config);
  const staging = new StagingRepository(sql, {
    readPageSize: config.RAW_STAGING_READ_PAGE_SIZE,
    writePageSize: config.RAW_STAGING_WRITE_PAGE_SIZE,
    statusUpdateBatchSize: config.RAW_STAGING_STATUS_UPDATE_BATCH_SIZE
  });

  const stagingStartedAt = Date.now();
  logger.info("full_pipeline.staging_refresh.start", {
    rawStagingReadPageSize: config.RAW_STAGING_READ_PAGE_SIZE,
    rawStagingWritePageSize: config.RAW_STAGING_WRITE_PAGE_SIZE
  });
  const openFeed = await stageFeed(staging, config.RAW_STAGING_WRITE_PAGE_SIZE, "open_events", () => client.fetchActiveEvents());
  const closedFeed = await stageFeed(staging, config.RAW_STAGING_WRITE_PAGE_SIZE, "closed_events", () => client.fetchClosedEvents());
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
    normalizationMode: "stage-normalize",
    normalizationSource: config.PIPELINE_NORMALIZATION_SOURCE,
    relationshipSyncBatchSize: config.RELATIONSHIP_SYNC_BATCH_SIZE,
    rawStagingStatusUpdateBatchSize: config.RAW_STAGING_STATUS_UPDATE_BATCH_SIZE,
    cleanupMode: config.RAW_STAGING_CLEANUP_MODE
  });
  const normalizationService = new StagingNormalizationService(sql, new MarketRepository(sql, {
    relationshipSyncBatchSize: config.RELATIONSHIP_SYNC_BATCH_SIZE
  }), {
    readPageSize: config.RAW_STAGING_READ_PAGE_SIZE,
    writePageSize: config.RAW_STAGING_WRITE_PAGE_SIZE,
    statusUpdateBatchSize: config.RAW_STAGING_STATUS_UPDATE_BATCH_SIZE,
    cleanupMode: config.RAW_STAGING_CLEANUP_MODE
  });
  let normalization: StagingNormalizationStats;
  if (config.PIPELINE_NORMALIZATION_SOURCE === "stored-procedure") {
    const [openProcedureResult] = await sql<{ summary: StoredProcedureSummary }[]>`
      select probis2_normalize_gamma_open_batch_prototype(${openFeed.batchId}) as summary
    `;
    const openSummary = openProcedureResult?.summary;
    if (!openSummary) throw new Error("Stored-procedure open normalization returned no summary");
    logger.info("full_pipeline.stored_procedure_open.complete", {
      batchId: openFeed.batchId,
      eventsSeen: openSummary.events_seen,
      eventsUpserted: openSummary.events_upserted,
      eventsExcluded: openSummary.events_excluded,
      marketsSeen: openSummary.markets_seen,
      marketsUpserted: openSummary.markets_upserted,
      marketsExcluded: openSummary.markets_excluded,
      outcomesUpserted: openSummary.outcomes_upserted,
      eventMarketsUpserted: openSummary.event_markets_upserted,
      marketCategoriesUpserted: openSummary.market_categories_upserted,
      eventTagsUpserted: openSummary.event_tags_upserted,
      marketTagsUpserted: openSummary.market_tags_upserted,
      durationMs: openSummary.duration_ms,
      limitationNotes: JSON.stringify(openSummary.limitation_notes ?? [])
    });

    const [closedProcedureResult] = await sql<{ summary: StoredProcedureClosedLifecycleSummary }[]>`
      select probis2_reconcile_gamma_closed_batch_prototype(${closedFeed.batchId}) as summary
    `;
    const closedSummary = closedProcedureResult?.summary;
    if (!closedSummary) throw new Error("Stored-procedure closed lifecycle reconciliation returned no summary");
    logger.info("full_pipeline.stored_procedure_closed_lifecycle.complete", {
      batchId: closedFeed.batchId,
      closedEventsSeen: closedSummary.closed_events_seen,
      closedMarketsSeen: closedSummary.closed_markets_seen,
      eventsMatched: closedSummary.events_matched,
      marketsMatched: closedSummary.markets_matched,
      eventsClosed: closedSummary.events_closed,
      eventsArchived: closedSummary.events_archived,
      marketsClosed: closedSummary.markets_closed,
      marketsArchived: closedSummary.markets_archived,
      marketsResolved: closedSummary.markets_resolved,
      marketsAutomaticallyResolved: closedSummary.markets_automatically_resolved,
      marketsFinalPeriodFt: closedSummary.markets_final_period_ft,
      marketsFinishedTimestamp: closedSummary.markets_finished_timestamp,
      marketsClosedTimeSet: closedSummary.markets_closed_time_set,
      marketsLifecycleUpdated: closedSummary.markets_lifecycle_updated,
      durationMs: closedSummary.duration_ms,
      limitationNotes: JSON.stringify(closedSummary.limitation_notes ?? [])
    });

    normalization = {
      batchId: openFeed.batchId,
      fetchedRawMarketCount: openFeed.marketsFetched,
      insertedRawEventRows: openFeed.rawEvents.inserted,
      insertedRawMarketRows: openFeed.rawMarkets.inserted,
      skippedOrDuplicateRawMarketCount: Math.max(0, openFeed.marketsFetched - openFeed.rawMarkets.inserted),
      normalizedEvents: Number(openSummary.events_upserted ?? 0),
      normalizedMarkets: Number(openSummary.markets_upserted ?? 0),
      excludedEvents: Number(openSummary.events_excluded ?? 0),
      excludedMarkets: Number(openSummary.markets_excluded ?? 0),
      failedRows: 0,
      durationMs: Number(openSummary.duration_ms ?? 0) + Number(closedSummary.duration_ms ?? 0),
      timingBreakdown: {
        normalizationSource: "stored-procedure",
        storedProcedureOpenSummary: openSummary,
        storedProcedureClosedLifecycleSummary: closedSummary,
        limitationNotes: [
          ...(openSummary.limitation_notes ?? []),
          ...(closedSummary.limitation_notes ?? [])
        ]
      }
    };
  } else if (config.PIPELINE_NORMALIZATION_SOURCE === "memory") {
    normalization = await normalizationService.normalizeOpenEventsFromMemory({
      batchId: openFeed.batchId,
      events: openFeed.events,
      insertedRawEventRows: openFeed.rawEvents.inserted,
      insertedRawMarketRows: openFeed.rawMarkets.inserted,
      fetchedRawMarketCount: openFeed.marketsFetched
    });
  } else {
    normalization = await normalizationService.normalizeLatestOpenEvents(openFeed.batchId);
  }
  logger.info("full_pipeline.staging_normalization.complete", {
    ...normalization,
    normalizationSource: config.PIPELINE_NORMALIZATION_SOURCE,
    timingBreakdown: JSON.stringify(normalization.timingBreakdown),
    durationMs: Date.now() - normalizationStartedAt
  });

  const cardRefreshStartedAt = Date.now();
  logger.info("full_pipeline.explorer_cards_refresh.start", {});
  const cards = await new ExplorerCardRepository(sql, config).refresh();
  logger.info("full_pipeline.explorer_cards_refresh.complete", {
    ...cards,
    timingBreakdown: JSON.stringify(cards.timingBreakdown),
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
    closedEventsSeen: (normalization.timingBreakdown.storedProcedureClosedLifecycleSummary as StoredProcedureClosedLifecycleSummary | undefined)?.closed_events_seen,
    closedMarketsSeen: (normalization.timingBreakdown.storedProcedureClosedLifecycleSummary as StoredProcedureClosedLifecycleSummary | undefined)?.closed_markets_seen,
    closedEventsMatched: (normalization.timingBreakdown.storedProcedureClosedLifecycleSummary as StoredProcedureClosedLifecycleSummary | undefined)?.events_matched,
    closedMarketsMatched: (normalization.timingBreakdown.storedProcedureClosedLifecycleSummary as StoredProcedureClosedLifecycleSummary | undefined)?.markets_matched,
    closedMarketsLifecycleUpdated: (normalization.timingBreakdown.storedProcedureClosedLifecycleSummary as StoredProcedureClosedLifecycleSummary | undefined)?.markets_lifecycle_updated,
    cardsBuilt: cards.cardsBuilt,
    visibleCards: cards.visibleCards,
    cleanupMode,
    normalizationSource: config.PIPELINE_NORMALIZATION_SOURCE,
    rawStagingReadPageSize: config.RAW_STAGING_READ_PAGE_SIZE,
    rawStagingWritePageSize: config.RAW_STAGING_WRITE_PAGE_SIZE,
    rawStagingStatusUpdateBatchSize: config.RAW_STAGING_STATUS_UPDATE_BATCH_SIZE,
    relationshipSyncBatchSize: config.RELATIONSHIP_SYNC_BATCH_SIZE,
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
