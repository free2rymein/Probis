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
    logger.info("market_discovery.start", {
      intervalMs: this.config.MARKET_DISCOVERY_INTERVAL_MS
    });

    while (!this.stopped) {
      await this.syncOnce();
      await sleep(jitter(this.config.MARKET_DISCOVERY_INTERVAL_MS));
    }
  }

  async syncOnce() {
    const startedAt = Date.now();
    const rawMarkets = await this.client.fetchActiveMarkets(this.config.MAX_MARKETS_PER_POLL);
    const markets = rawMarkets.map(normalizePolymarketMarket).filter((market) => market !== null);
    const rows = await this.repositories.markets.upsertMany(markets);

    logger.info("market_discovery.synced", {
      fetched: rawMarkets.length,
      normalized: markets.length,
      upserted: rows.length,
      durationMs: Date.now() - startedAt
    });
  }
}
