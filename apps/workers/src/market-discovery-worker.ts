import type { WorkerConfig } from "./config/env";
import type { LifecycleReconciliationWorker } from "./lifecycle-reconciliation-worker";
import type { MarketRepository } from "./services/market-repository";
import { createExclusionCounts, normalizeEvent } from "./services/normalization";
import type { PolymarketClient } from "./services/polymarket";
import { logger } from "./utils/logger";

export class MarketDiscoveryWorker {
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly config: WorkerConfig,
    private readonly client: PolymarketClient,
    private readonly repository: MarketRepository,
    private readonly lifecycleReconciliation: LifecycleReconciliationWorker
  ) {}

  async runOnce() {
    const cycleStartedAt = Date.now();
    const currentRunStartedAt = new Date();
    logger.info("market_discovery.start", {});
    const fetchStartedAt = Date.now();
    const closedFetchStartedAt = Date.now();
    const [rawEvents, closedEvents] = await Promise.all([
      this.client.fetchActiveEvents(),
      this.client.fetchClosedEvents()
    ]);
    const fetchDurationMs = Date.now() - fetchStartedAt;
    const closedFeedFetchDurationMs = Date.now() - closedFetchStartedAt;
    const normalizationStartedAt = Date.now();
    const exclusionCounts = createExclusionCounts();
    const events = rawEvents.map((event) => normalizeEvent(event, exclusionCounts)).filter((event) => event !== null);
    const normalizationDurationMs = Date.now() - normalizationStartedAt;
    const guardrailStartedAt = Date.now();
    const guardrailStats = await this.repository.applyOpenFeedGuardrails(rawEvents, currentRunStartedAt);
    const guardrailDurationMs = Date.now() - guardrailStartedAt;
    const persistenceStartedAt = Date.now();
    const eventStats = await this.repository.syncEvents(events, [], currentRunStartedAt);
    const persistenceDurationMs = Date.now() - persistenceStartedAt;
    logger.info("market_discovery.events_persisted", {
      fetchedEvents: rawEvents.length,
      processedEvents: eventStats.events,
      processedMarkets: eventStats.markets,
      persistenceTimings: JSON.stringify(eventStats.timings),
      durationMs: Date.now() - persistenceStartedAt
    });
    const closedFeedStats = await this.repository.syncClosedEvents(closedEvents);
    const staleCleanupStats = await this.repository.cleanupStaleOpenEvents(
      this.config.OPEN_FEED_STALE_GRACE_MINUTES,
      this.config.STALE_CLOSE_END_DATE_BUFFER_HOURS,
      this.config.ENABLE_SET_BASED_STALE_CLOSE
    );
    const lifecycleStats = await this.lifecycleReconciliation.runOnce();

    const stats = {
      events: eventStats.events,
      markets: eventStats.markets,
      categoriesAssigned: eventStats.categoriesAssigned,
      otherMarkets: eventStats.otherMarkets,
      unknownTags: eventStats.unknownTags,
      categoryCounts: { ...eventStats.categoryCounts }
    };
    const categoryCoverage = stats.markets === 0 ? 0 : (stats.markets - stats.otherMarkets) / stats.markets;
    const topCategories = Object.entries(stats.categoryCounts)
      .sort((left, right) => right[1] - left[1])
      .slice(0, 10)
      .map(([category, count]) => ({ category, count }));
    logger.info("market_discovery.complete", {
      fetchedEvents: rawEvents.length,
      closedFeedFetchedEvents: closedFeedStats.fetchedEvents,
      fetchedMarkets: 0,
      processedEvents: stats.events,
      processedMarkets: stats.markets,
      categoriesAssigned: stats.categoriesAssigned,
      categoryCoverage,
      otherMarkets: stats.otherMarkets,
      uncategorizedMarkets: 0,
      unknownTags: stats.unknownTags,
      topCategories: JSON.stringify(topCategories),
      exclusionCounts: JSON.stringify(exclusionCounts),
      fetchDurationMs,
      normalizationDurationMs,
      persistenceDurationMs,
      persistenceTimings: JSON.stringify(eventStats.timings),
      guardrailDurationMs,
      openFeedEventsStamped: guardrailStats.eventsStamped,
      openFeedFinalEventsClosed: guardrailStats.finalEventsClosed,
      openFeedMarketsStamped: guardrailStats.marketsStamped,
      openFeedFinalMarketsClosed: guardrailStats.finalMarketsClosed,
      closedFeedFetchDurationMs,
      closedFeedBatchUpdateDurationMs: closedFeedStats.durationMs,
      localEventsBatchClosed: closedFeedStats.localEventsBatchClosed,
      localChildMarketsBatchClosed: closedFeedStats.localChildMarketsBatchClosed,
      staleCleanupCandidates: staleCleanupStats.candidates,
      staleCleanupApplied: staleCleanupStats.applied,
      staleCleanupEventsClosed: staleCleanupStats.eventsClosed,
      staleCleanupChildMarketsClosed: staleCleanupStats.childMarketsClosed,
      staleCleanupDurationMs: staleCleanupStats.durationMs,
      lifecycleReconcileDurationMs: lifecycleStats.durationMs,
      lifecycleCandidatesSelected: lifecycleStats.candidatesSelected,
      lifecycleDetailChecksPerformed: lifecycleStats.detailFetchesAttempted,
      lifecycleEventsConfirmedClosed: lifecycleStats.eventsConfirmedClosed,
      totalDurationMs: Date.now() - cycleStartedAt
    });
  }

  start() {
    void this.runOnce().catch((error: unknown) =>
      logger.error("market_discovery.failed", {
        message: error instanceof Error ? error.message : "Unknown discovery error"
      })
    );
    this.timer = setInterval(() => {
      void this.runOnce().catch((error: unknown) =>
        logger.error("market_discovery.failed", {
          message: error instanceof Error ? error.message : "Unknown discovery error"
        })
      );
    }, this.config.MARKET_DISCOVERY_INTERVAL_MS);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
  }
}
