import type { WorkerConfig } from "../config/env";
import { logger } from "../utils/logger";
import { jitter, sleep } from "../utils/time";
import { activeWhaleProfiles, summarizeCoActivity } from "./analytics/activity";
import { buildCoActivityPrimitives } from "./clustering/co-activity";
import type { WalletIntelligenceRepository } from "./repositories/wallet-repository";
import { scoreWalletProfile } from "./scoring";

export class WalletIntelligenceProfiler {
  private stopped = false;

  constructor(
    private readonly config: WorkerConfig,
    private readonly repository: WalletIntelligenceRepository
  ) {}

  stop() {
    this.stopped = true;
  }

  async run() {
    if (!this.config.WALLET_INTELLIGENCE_ENABLED) {
      logger.info("wallet_intelligence.disabled", {});
      return;
    }

    logger.info("wallet_intelligence.start", {
      intervalMs: this.config.WALLET_ANALYSIS_INTERVAL_MS,
      lookbackDays: this.config.WALLET_LOOKBACK_DAYS
    });

    while (!this.stopped) {
      const startedAt = performance.now();
      try {
        await this.runOnce();
      } catch (error) {
        logger.error("wallet_intelligence.error", {
          message: error instanceof Error ? error.message : "Unknown wallet intelligence error"
        });
      }

      await sleep(
        jitter(
          Math.max(5_000, this.config.WALLET_ANALYSIS_INTERVAL_MS - (performance.now() - startedAt))
        )
      );
    }
  }

  async runOnce() {
    const startedAt = Date.now();
    const since = new Date(startedAt - this.config.WALLET_LOOKBACK_DAYS * 24 * 60 * 60_000);
    const profileLimit = Math.max(200, this.config.INTELLIGENCE_MAX_MARKETS_PER_RUN * 5);

    logger.info("wallet_intelligence.run", {
      since: since.toISOString(),
      profileLimit
    });

    const profileInputs = await this.repository.getRecentWalletProfiles(
      since,
      this.config.WHALE_TRADE_USD_THRESHOLD,
      profileLimit
    );
    const walletAddresses = profileInputs.map((profile) => profile.walletAddress);
    const marketActivity = await this.repository.getRecentWalletMarketActivity(
      since,
      walletAddresses
    );
    const dailyStats = await this.repository.getRecentWalletDailyStats(since, walletAddresses);

    const scoredProfiles = profileInputs.map((profile) => ({
      ...profile,
      ...scoreWalletProfile(profile, this.config.SMART_MONEY_MIN_VOLUME_USD)
    }));

    await this.repository.upsertProfiles(scoredProfiles);
    await this.repository.upsertMarketActivity(marketActivity);
    await this.repository.upsertDailyStats(dailyStats);

    const whales = activeWhaleProfiles(profileInputs, this.config.WHALE_TRADE_USD_THRESHOLD);
    await this.emitRepeatWhaleSignals(
      scoredProfiles.filter((profile) =>
        whales.some((whale) => whale.walletAddress === profile.walletAddress)
      )
    );
    await this.emitCoordinatedActivitySignals(since);

    logger.info("wallet_intelligence.complete", {
      profilesUpdated: scoredProfiles.length,
      marketRowsUpdated: marketActivity.length,
      dailyRowsUpdated: dailyStats.length,
      activeWhales: whales.length,
      durationMs: Date.now() - startedAt
    });
  }

  private async emitRepeatWhaleSignals(
    whales: Array<{
      walletAddress: string;
      largeTradeCount: number;
      maxTradeUsd: number;
      anomalyTriggerCount: number;
      smartMoneyScore: number;
    }>
  ) {
    for (const whale of whales.filter((item) => item.largeTradeCount >= 3).slice(0, 25)) {
      const candidateMarkets = await this.repository.getRecentWalletMarketActivity(
        new Date(Date.now() - this.config.WALLET_LOOKBACK_DAYS * 24 * 60 * 60_000),
        [whale.walletAddress]
      );
      const primaryMarket = candidateMarkets.sort((a, b) => b.totalVolumeUsd - a.totalVolumeUsd)[0];
      if (!primaryMarket) continue;

      const duplicate = await this.repository.findRecentDuplicate(
        primaryMarket.marketId,
        "repeat_whale_activity",
        new Date(Date.now() - 30 * 60_000)
      );
      if (duplicate) {
        logger.info("wallet_intelligence.skipped_duplicate", {
          anomalyType: "repeat_whale_activity",
          marketId: primaryMarket.marketId
        });
        continue;
      }

      await this.repository.insertWalletAnomaly({
        marketId: primaryMarket.marketId,
        anomalyType: "repeat_whale_activity",
        severityScore: Math.min(100, 55 + whale.largeTradeCount * 6),
        confidenceScore: Math.min(95, 65 + whale.anomalyTriggerCount * 5),
        walletAddresses: [whale.walletAddress],
        summary: `${whale.walletAddress.slice(0, 6)}...${whale.walletAddress.slice(
          -4
        )} shows repeated whale activity across recent prediction-market trades.`,
        metadata: {
          wallet_address: whale.walletAddress,
          large_trade_count: whale.largeTradeCount,
          max_trade_usd: whale.maxTradeUsd,
          smart_money_score: whale.smartMoneyScore,
          related_wallet_addresses: [whale.walletAddress]
        },
        detectedAt: new Date()
      });
      logger.info("wallet_intelligence.anomaly_detected", {
        anomalyType: "repeat_whale_activity",
        walletAddress: whale.walletAddress
      });
    }
  }

  private async emitCoordinatedActivitySignals(since: Date) {
    const candidates = await this.repository.getCoordinatedActivityCandidates(
      since,
      this.config.COORDINATED_ACTIVITY_THRESHOLD,
      Math.max(1_000, this.config.WHALE_TRADE_USD_THRESHOLD / 2)
    );
    const primitives = buildCoActivityPrimitives(candidates);

    for (const candidate of candidates.slice(0, 10)) {
      const duplicate = await this.repository.findRecentDuplicate(
        candidate.marketId,
        "coordinated_wallet_activity",
        new Date(Date.now() - 30 * 60_000)
      );
      if (duplicate) continue;

      await this.repository.insertWalletAnomaly({
        marketId: candidate.marketId,
        anomalyType: "coordinated_wallet_activity",
        severityScore: Math.min(100, 50 + candidate.walletAddresses.length * 8),
        confidenceScore: Math.min(90, 55 + candidate.tradeCount * 3),
        walletAddresses: candidate.walletAddresses,
        summary: `${candidate.walletAddresses.length} wallets traded the same market in a tight recent window.`,
        metadata: {
          related_wallet_addresses: candidate.walletAddresses,
          trade_count: candidate.tradeCount,
          total_volume_usd: candidate.totalVolumeUsd,
          clustering_primitives: primitives.filter(
            (primitive) => primitive.marketId === candidate.marketId
          ),
          co_activity_summary: summarizeCoActivity([candidate])
        },
        detectedAt: candidate.endedAt
      });
      logger.info("wallet_intelligence.anomaly_detected", {
        anomalyType: "coordinated_wallet_activity",
        marketId: candidate.marketId,
        walletCount: candidate.walletAddresses.length
      });
    }
  }
}
