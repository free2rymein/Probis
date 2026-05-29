import type { WorkerConfig } from "../config/env";
import { selectMarketUniverse } from "./market-universe";
import { normalizePolymarketMarket } from "../normalization/polymarket";
import type { createWorkerRepositories } from "../repositories";
import { PolymarketClient } from "../services/polymarket-client";
import type { NormalizedMarket } from "../types/events";
import type { PolymarketMarket } from "../types/polymarket";
import { errorFields } from "../utils/errors";
import { logger } from "../utils/logger";
import { serializeJson } from "../utils/serialization";
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
      try {
        await this.syncOnce();
        await this.repositories.systemStatus
          .success({
            serviceName: "workers",
            status: "running",
            statusMessage: "Market discovery completed successfully.",
            metadata: { lastTask: "market_discovery" }
          })
          .catch((statusError: unknown) => {
            logger.warn("worker_status.market_discovery_success_failed", {
              ...errorFields(statusError)
            });
          });
      } catch (error) {
        logger.error("market_discovery.error", {
          ...errorFields(error)
        });
        await this.repositories.systemStatus
          .failure({
            serviceName: "workers",
            statusMessage: "Market discovery failed; worker heartbeat is still active.",
            metadata: { lastTask: "market_discovery", error: errorFields(error) }
          })
          .catch((statusError: unknown) => {
            logger.warn("worker_status.market_discovery_failure_failed", {
              ...errorFields(statusError)
            });
          });
      }
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
    logger.info("market_selection.start", {
      pageLimit: this.config.RAW_MARKET_FETCH_LIMIT,
      maxPages: this.config.MAX_MARKET_FETCH_PAGES,
      activeOnly: this.config.MARKET_SYNC_ACTIVE_ONLY,
      strategy: this.config.MARKET_UNIVERSE_STRATEGY,
      universeLimit: this.config.ACTIVE_MARKET_UNIVERSE_LIMIT
    });
    logger.info("polymarket.market_sync.start", {
      limit: this.config.RAW_MARKET_FETCH_LIMIT * this.config.MAX_MARKET_FETCH_PAGES,
      activeOnly: this.config.MARKET_SYNC_ACTIVE_ONLY
    });
    const rawMarkets = await this.fetchMarketPages();
    logger.info("market_selection.fetched", {
      fetchedCount: rawMarkets.length,
      pageLimit: this.config.RAW_MARKET_FETCH_LIMIT,
      maxPages: this.config.MAX_MARKET_FETCH_PAGES
    });
    const markets = rawMarkets.map(normalizePolymarketMarket).filter((market) => market !== null);
    const context =
      this.config.MARKET_UNIVERSE_STRATEGY === "mvp_interest"
        ? new Map()
        : await this.repositories.markets.getUniverseContext(
            "polymarket",
            markets.map((market) => market.externalId)
          );
    logger.info("market_universe.selection.start", {
      fetchedMarkets: rawMarkets.length,
      normalizedMarkets: markets.length,
      strategy: this.config.MARKET_UNIVERSE_STRATEGY,
      universeLimit: this.config.ACTIVE_MARKET_UNIVERSE_LIMIT,
      minMarketLiquidity: this.config.MIN_MARKET_LIQUIDITY,
      minMarketVolume24h: this.config.MIN_MARKET_VOLUME_24H
    });

    const selection = selectMarketUniverse(markets, this.config, context);
    const selectedExternalIds = selection.markets
      .filter((market) => market.isActiveUniverse)
      .map((market) => market.externalId);

    for (const filtered of selection.filteredMarkets) {
      logger.info("market_quality.market_filtered", {
        title: filtered.title,
        category: filtered.category,
        volume24h: filtered.volume24h,
        liquidity: filtered.liquidity,
        probability: filtered.probability,
        reason: filtered.reason
      });
      logger.info("market_universe.market_excluded", {
        title: filtered.title,
        category: filtered.category,
        volume24h: filtered.volume24h,
        liquidity: filtered.liquidity,
        probability: filtered.probability,
        reason: filtered.reason
      });
    }

    for (const scored of selection.scoredMarkets) {
      logger.info("market_quality.market_scored", {
        title: scored.market.title,
        category: scored.market.category,
        volume24h: scored.volume24h,
        liquidity: scored.liquidity,
        totalVolume: scored.totalVolume,
        qualityScore: scored.interestScore
      });
    }

    for (const selected of selection.selectedMarkets) {
      logger.info("market_quality.top_selected", {
        title: selected.market.title,
        category: selected.market.category,
        volume24h: selected.volume24h,
        totalVolume: selected.totalVolume,
        liquidity: selected.liquidity,
        probability: selected.probability,
        qualityScore: selected.interestScore
      });
      logger.info("market_universe.market_selected", {
        title: selected.market.title,
        category: selected.market.category,
        volume24h: selected.volume24h,
        totalVolume: selected.totalVolume,
        liquidity: selected.liquidity,
        probability: selected.probability,
        interestScore: selected.interestScore
      });
      logger.info("market_selection.top_selected", {
        rank: selected.rank,
        title: selected.market.title,
        category: selected.category,
        liquidity: selected.liquidity,
        volume24h: selected.volume24h,
        totalVolume: selected.totalVolume,
        interestScore: selected.interestScore
      });
    }

    const marketsToPersist = (
      this.config.STORE_ONLY_ACTIVE_UNIVERSE
        ? selection.markets.filter((market) => market.isActiveUniverse)
        : selection.markets
    ).map((market) => this.compactMarketForPersistence(market));

    if (this.config.STORE_ONLY_ACTIVE_UNIVERSE) {
      await this.repositories.markets.replaceActiveUniverse("polymarket", []);
    }

    const rows = await this.repositories.markets.upsertMany(marketsToPersist);

    if (!this.config.STORE_ONLY_ACTIVE_UNIVERSE) {
      await this.repositories.markets.replaceActiveUniverse("polymarket", selectedExternalIds);
    }

    logger.info("market_persistence.selected_only", {
      fetchedCount: rawMarkets.length,
      eligibleCount: selection.eligibleCount,
      selectedCount: selection.selectedCount,
      persistedCount: rows.length,
      skippedPersistenceCount: selection.markets.length - marketsToPersist.length,
      storeOnlyActiveUniverse: this.config.STORE_ONLY_ACTIVE_UNIVERSE
    });

    await this.repositories.timeline.appendMany(
      rows.map((row) => ({
        marketId: row.id,
        eventType: "market_sync",
        eventTimestamp: new Date(),
        payload: serializeJson({
          source: row.source,
          externalId: row.externalId,
          conditionId: row.conditionId,
          clobTokenIds: row.clobTokenIds,
          status: row.status,
          currentProbabilityYes: row.currentProbabilityYes,
          currentProbabilityNo: row.currentProbabilityNo,
          isActiveUniverse: row.isActiveUniverse,
          marketQualityScore: row.marketQualityScore,
          universeTier: row.universeTier,
          intelligenceWeightedScore: row.intelligenceWeightedScore,
          exclusionReason: row.exclusionReason,
          universeRank: row.universeRank
        })
      }))
    );

    logger.info("polymarket.market_sync.complete", {
      fetched: rawMarkets.length,
      normalized: selection.markets.length,
      upserted: rows.length,
      durationMs: Date.now() - startedAt
    });
    logger.info("market_universe.selection_stats", {
      fetchedMarkets: rawMarkets.length,
      eligibleMarkets: selection.eligibleCount,
      selectedMarkets: selection.selectedCount,
      minVolume: selection.stats.minVolume,
      maxVolume: selection.stats.maxVolume,
      avgVolume: selection.stats.avgVolume,
      minLiquidity: selection.stats.minLiquidity,
      maxLiquidity: selection.stats.maxLiquidity,
      avgLiquidity: selection.stats.avgLiquidity,
      strategy: this.config.MARKET_UNIVERSE_STRATEGY,
      universeLimit: this.config.ACTIVE_MARKET_UNIVERSE_LIMIT
    });
    logger.info("market_selection.eligible", {
      eligibleCount: selection.eligibleCount,
      fetchedCount: rawMarkets.length
    });
    logger.info("market_selection.selected", {
      selectedCount: selection.selectedCount,
      minVolume: selection.stats.minVolume,
      maxVolume: selection.stats.maxVolume,
      avgVolume: selection.stats.avgVolume,
      minLiquidity: selection.stats.minLiquidity,
      maxLiquidity: selection.stats.maxLiquidity,
      avgLiquidity: selection.stats.avgLiquidity
    });
    logger.info("market_selection.rejection_counts", selection.rejectionCounts);
    logger.info("market_universe.selection.complete", {
      fetchedMarkets: rawMarkets.length,
      eligibleMarkets: selection.eligibleCount,
      selectedMarkets: selection.selectedCount,
      strategy: this.config.MARKET_UNIVERSE_STRATEGY,
      universeLimit: this.config.ACTIVE_MARKET_UNIVERSE_LIMIT
    });
  }

  private async fetchMarketPages() {
    const markets = new Map<string, PolymarketMarket>();

    for (let page = 0; page < this.config.MAX_MARKET_FETCH_PAGES; page += 1) {
      const offset = page * this.config.RAW_MARKET_FETCH_LIMIT;
      const pageMarkets = await this.client.fetchActiveMarkets(
        this.config.RAW_MARKET_FETCH_LIMIT,
        offset
      );
      if (pageMarkets.length === 0) break;

      let newMarkets = 0;
      for (const market of pageMarkets) {
        const key = market.conditionId ?? market.id ?? market.slug;
        if (!key || markets.has(key)) continue;
        markets.set(key, market);
        newMarkets += 1;
      }

      if (newMarkets === 0) break;
      if (pageMarkets.length < this.config.RAW_MARKET_FETCH_LIMIT) break;
    }

    return [...markets.values()];
  }

  private compactMarketForPersistence(market: NormalizedMarket): NormalizedMarket {
    const tags = Array.isArray(market.metadata.tags) ? market.metadata.tags.map(String) : [];
    const field = (key: string) => market.metadata[key] ?? null;

    return {
      ...market,
      metadata: {
        slug: market.slug,
        tags,
        category: market.category,
        raw_category: field("raw_category"),
        end_date: field("end_date"),
        updated_at: field("updated_at"),
        gamma_volume: field("gamma_volume"),
        gamma_volume_24h: field("gamma_volume_24h"),
        gamma_liquidity: field("gamma_liquidity"),
        current_probability_yes: market.currentProbabilityYes ?? market.currentProbability,
        current_probability_no: market.currentProbabilityNo ?? null,
        active: field("active"),
        closed: field("closed"),
        resolved: field("resolved"),
        archived: field("archived")
      }
    };
  }
}
