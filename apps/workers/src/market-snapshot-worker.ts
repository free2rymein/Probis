import type { WorkerConfig } from "./config/env";
import type { MarketRepository } from "./services/market-repository";
import { normalizeMarket } from "./services/normalization";
import type { PolymarketClient } from "./services/polymarket";
import { logger } from "./utils/logger";

export class MarketSnapshotWorker {
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly config: WorkerConfig,
    private readonly client: PolymarketClient,
    private readonly repository: MarketRepository
  ) {}

  async runOnce() {
    const raw = await this.client.fetchActiveMarkets();
    const normalized = raw.map((market) => normalizeMarket(market)).filter((market) => market !== null);
    const inserted = await this.repository.snapshotKnownMarkets(normalized);
    logger.info("market_snapshot.complete", { fetched: raw.length, normalized: normalized.length, inserted });
  }

  start() {
    void this.runOnce().catch((error: unknown) =>
      logger.error("market_snapshot.failed", {
        message: error instanceof Error ? error.message : "Unknown snapshot error"
      })
    );
    this.timer = setInterval(() => {
      void this.runOnce().catch((error: unknown) =>
        logger.error("market_snapshot.failed", {
          message: error instanceof Error ? error.message : "Unknown snapshot error"
        })
      );
    }, this.config.MARKET_SNAPSHOT_INTERVAL_MS);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
  }
}
