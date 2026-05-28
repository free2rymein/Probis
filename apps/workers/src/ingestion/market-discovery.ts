import type { WorkerConfig } from "../config/env";
import { normalizePolymarketMarket } from "../normalization/polymarket";
import type { createWorkerRepositories } from "../repositories";
import { PolymarketClient } from "../services/polymarket-client";
import { logger } from "../utils/logger";
import { jitter, sleep } from "../utils/time";

type Repositories = ReturnType<typeof createWorkerRepositories>;

export class MarketDiscoveryService {
  private stopped = false;

  constructor(
    private readonly config: WorkerConfig,
    private readonly repositories: Repositories,
    private readonly client = new PolymarketClient(config)
  ) {}

  stop() {
    this.stopped = true;
  }

  async run() {
    if (this.config.WORKER_MODE === "live") {
      logger.info("live_mode.enabled", {});
    }

    logger.info("market_discovery.start", {
      intervalMs: this.config.MARKET_DISCOVERY_INTERVAL_MS
    });

    while (!this.stopped) {
      await this.syncOnce();
      await sleep(jitter(this.config.MARKET_DISCOVERY_INTERVAL_MS));
    }
  }

  async syncOnce() {
    if (this.config.WORKER_MODE === "mock") {
      const { createMockMarket } = await import("../services/mock-source");
      const rows = await this.repositories.markets.upsertMany([createMockMarket()]);
      logger.info("market_discovery.mock_synced", { upserted: rows.length });
      return;
    }

    const startedAt = Date.now();
    logger.info("polymarket.market_sync.start", {
      limit: this.config.MARKET_SYNC_LIMIT,
      activeOnly: this.config.MARKET_SYNC_ACTIVE_ONLY
    });
    const rawMarkets = await this.client.fetchActiveMarkets(this.config.MARKET_SYNC_LIMIT);
    const markets = rawMarkets.map(normalizePolymarketMarket).filter((market) => market !== null);
    const rows = await this.repositories.markets.upsertMany(markets);

    await this.repositories.timeline.appendMany(
      rows.map((row) => ({
        marketId: row.id,
        eventType: "market_sync",
        eventTimestamp: new Date(),
        payload: {
          source: row.source,
          externalId: row.externalId,
          conditionId: row.conditionId,
          clobTokenIds: row.clobTokenIds,
          status: row.status
        }
      }))
    );

    logger.info("polymarket.market_sync.complete", {
      fetched: rawMarkets.length,
      normalized: markets.length,
      upserted: rows.length,
      durationMs: Date.now() - startedAt
    });
  }
}
