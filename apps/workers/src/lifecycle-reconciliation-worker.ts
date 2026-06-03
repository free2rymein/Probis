import type { WorkerConfig } from "./config/env";
import type { LifecycleReconcileCandidate, MarketRepository } from "./services/market-repository";
import type { PolymarketClient } from "./services/polymarket";
import { logger } from "./utils/logger";

export type LifecycleReconcileStats = {
  candidatesSelected: number;
  detailFetchesAttempted: number;
  eventsConfirmedClosed: number;
  eventsRefreshedStillOpen: number;
  childMarketsUpdated: number;
  childMarketsMissingLocally: number;
  notFound: number;
  fetchFailures: number;
  durationMs: number;
};

export class LifecycleReconciliationWorker {
  constructor(
    private readonly config: WorkerConfig,
    private readonly client: PolymarketClient,
    private readonly repository: MarketRepository
  ) {}

  async runOnce(): Promise<LifecycleReconcileStats> {
    const startedAt = Date.now();
    const candidates = await this.repository.selectLifecycleReconcileCandidates(
      this.config.LIFECYCLE_RECONCILE_LIMIT,
      this.config.LIFECYCLE_RECONCILE_STALE_MINUTES
    );
    const stats: LifecycleReconcileStats = {
      candidatesSelected: candidates.length,
      detailFetchesAttempted: 0,
      eventsConfirmedClosed: 0,
      eventsRefreshedStillOpen: 0,
      childMarketsUpdated: 0,
      childMarketsMissingLocally: 0,
      notFound: 0,
      fetchFailures: 0,
      durationMs: 0
    };
    let nextIndex = 0;

    const reconcile = async (candidate: LifecycleReconcileCandidate) => {
      stats.detailFetchesAttempted += 1;
      try {
        const detail = await this.client.fetchEventDetail(candidate.externalEventId);
        if (!detail) {
          stats.notFound += 1;
          await this.repository.markLifecycleChecked(candidate.id);
          logger.warn("lifecycle_reconcile.not_found", {
            externalEventId: candidate.externalEventId,
            title: candidate.title
          });
          return;
        }
        const update = await this.repository.reconcileEventDetail(candidate.id, detail);
        stats.childMarketsUpdated += update.childMarketsUpdated;
        stats.childMarketsMissingLocally += update.childMarketsMissingLocally;
        if (update.eventClosed) stats.eventsConfirmedClosed += 1;
        else stats.eventsRefreshedStillOpen += 1;
      } catch (error: unknown) {
        stats.fetchFailures += 1;
        await this.repository.markLifecycleChecked(candidate.id);
        logger.warn("lifecycle_reconcile.failed", {
          externalEventId: candidate.externalEventId,
          title: candidate.title,
          message: error instanceof Error ? error.message : "Unknown lifecycle reconciliation error"
        });
      }
    };

    const workerCount = Math.min(this.config.LIFECYCLE_RECONCILE_CONCURRENCY, candidates.length);
    await Promise.all(Array.from({ length: workerCount }, async () => {
      while (nextIndex < candidates.length) {
        const candidate = candidates[nextIndex];
        nextIndex += 1;
        if (candidate) await reconcile(candidate);
      }
    }));

    stats.durationMs = Date.now() - startedAt;
    logger.info("lifecycle_reconcile.complete", stats);
    return stats;
  }
}
