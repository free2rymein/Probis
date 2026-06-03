import { detectActivityBurst } from "./anomaly-detectors/activity-burst";
import { detectProbabilityShock } from "./anomaly-detectors/probability-shock";
import { detectVolumeSpike } from "./anomaly-detectors/volume-spike";
import { detectWhaleActivity } from "./anomaly-detectors/whale-activity";
import type { IntelligenceConfig } from "./config";
import type { IntelligenceRepository } from "./repositories/intelligence-repository";
import type { AnomalyCandidate } from "./types";
import { errorFields } from "../utils/errors";
import { logger } from "../utils/logger";
import { jitter, sleep } from "../utils/time";

export class IntelligenceEngine {
  private stopped = false;

  constructor(
    private readonly config: IntelligenceConfig,
    private readonly repository: IntelligenceRepository
  ) {}

  stop() {
    this.stopped = true;
  }

  async run() {
    if (!this.config.enabled) {
      logger.info("intelligence_engine.disabled", {});
      return;
    }

    logger.info("intelligence_engine.start", {
      intervalMs: this.config.intervalMs,
      maxMarketsPerRun: this.config.maxMarketsPerRun
    });

    while (!this.stopped) {
      const startedAt = performance.now();

      try {
        await this.runOnce();
      } catch (error) {
        logger.error("intelligence_engine.error", {
          ...errorFields(error)
        });
      }

      const elapsedMs = performance.now() - startedAt;
      await sleep(jitter(Math.max(1_000, this.config.intervalMs - elapsedMs)));
    }
  }

  async runOnce() {
    const runStartedAt = Date.now();
    logger.info("intelligence_engine.run", {
      maxMarketsPerRun: this.config.maxMarketsPerRun
    });

    const markets = await this.repository.getActiveMarketsForAnalysis(this.config.maxMarketsPerRun);
    const aggregateSince = new Date(runStartedAt - 75 * 60_000);
    let detectedCount = 0;
    let duplicateCount = 0;

    for (const market of markets) {
      const aggregates = await this.repository.getRecentAggregates(market.id, aggregateSince);
      const candidates = [
        detectProbabilityShock(market, aggregates, this.config),
        detectVolumeSpike(market, aggregates, this.config),
        detectActivityBurst(market, aggregates, this.config)
      ].filter((candidate): candidate is AnomalyCandidate => candidate !== null);

      for (const candidate of candidates) {
        const inserted = await this.insertIfNotDuplicate(candidate);
        if (inserted) detectedCount += 1;
        else duplicateCount += 1;
      }
    }

    const largeTradesSince = new Date(
      runStartedAt - Math.max(this.config.intervalMs * 2, 5 * 60_000)
    );
    const largeTrades = await this.repository.getRecentLargeTrades(
      largeTradesSince,
      this.config.whaleTradeUsdThreshold,
      this.config.maxMarketsPerRun
    );

    for (const trade of largeTrades) {
      const inserted = await this.insertIfNotDuplicate(detectWhaleActivity(trade));
      if (inserted) detectedCount += 1;
      else duplicateCount += 1;
    }

    logger.info("intelligence_engine.complete", {
      marketsProcessed: markets.length,
      largeTradesProcessed: largeTrades.length,
      detectedCount,
      duplicateCount,
      durationMs: Date.now() - runStartedAt
    });
  }

  private async insertIfNotDuplicate(candidate: AnomalyCandidate) {
    const dedupeWindowMs = this.config.dedupeWindowsMs[candidate.anomalyType];
    const duplicateSince = new Date(Date.now() - dedupeWindowMs);
    const duplicate = await this.repository.findRecentDuplicate(
      candidate.marketId,
      candidate.anomalyType,
      duplicateSince
    );

    if (duplicate) {
      logger.info("anomaly.skipped_duplicate", {
        marketId: candidate.marketId,
        anomalyType: candidate.anomalyType,
        duplicateId: duplicate.id
      });
      return false;
    }

    const inserted = await this.repository.insertAnomalyEvent(candidate);
    logger.info("anomaly.detected", {
      anomalyId: inserted?.id,
      marketId: candidate.marketId,
      anomalyType: candidate.anomalyType,
      severityScore: candidate.severityScore,
      confidenceScore: candidate.confidenceScore
    });
    return true;
  }
}
