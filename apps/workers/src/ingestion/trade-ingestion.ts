import WebSocket from "ws";
import type { WorkerConfig } from "../config/env";
import { OneMinuteAggregator } from "../aggregation/candles";
import { normalizePolymarketTrade } from "../normalization/polymarket";
import { Batcher } from "../queues/batcher";
import type { RealtimeEventBus } from "../realtime/event-bus";
import type { createWorkerRepositories } from "../repositories";
import { PolymarketClient } from "../services/polymarket-client";
import type { NormalizedTrade, ReplayEvent } from "../types/events";
import type { PolymarketTrade } from "../types/polymarket";
import { logger } from "../utils/logger";
import { jitter, sleep } from "../utils/time";

type Repositories = ReturnType<typeof createWorkerRepositories>;

export class TradeIngestionWorker {
  private stopped = false;
  private lastSeenTradeAt = new Map<string, Date>();
  private seenTradeIds = new Set<string>();
  private readonly aggregator = new OneMinuteAggregator();
  private readonly tradeBatcher: Batcher<NormalizedTrade>;
  private readonly timelineBatcher: Batcher<ReplayEvent>;

  constructor(
    private readonly config: WorkerConfig,
    private readonly repositories: Repositories,
    private readonly bus: RealtimeEventBus,
    private readonly client = new PolymarketClient(config)
  ) {
    this.tradeBatcher = new Batcher({
      name: "trades",
      maxSize: config.TRADE_BATCH_SIZE,
      flushIntervalMs: config.TRADE_FLUSH_INTERVAL_MS,
      flush: async (trades) => {
        const inserted = await this.repositories.trades.appendMany(trades);
        logger.info("trades.inserted", { attempted: trades.length, inserted: inserted.length });
        logger.info("polymarket.trade_deduped", { skipped: trades.length - inserted.length });
      }
    });

    this.timelineBatcher = new Batcher({
      name: "timeline",
      maxSize: config.TRADE_BATCH_SIZE,
      flushIntervalMs: config.TRADE_FLUSH_INTERVAL_MS,
      flush: async (events) => {
        await this.repositories.timeline.appendMany(events);
      }
    });
  }

  stop() {
    this.stopped = true;
    this.tradeBatcher.stop();
    this.timelineBatcher.stop();
  }

  async run() {
    this.tradeBatcher.start();
    this.timelineBatcher.start();
    this.startAggregateFlushLoop();

    if (this.config.POLYMARKET_WS_URL) {
      void this.runWebSocket();
    }

    await this.runPollingFallback();
  }

  private async runPollingFallback() {
    logger.info("trade_polling.start", {
      intervalMs: this.config.TRADE_POLL_INTERVAL_MS,
      mode: this.config.WORKER_MODE
    });

    while (!this.stopped) {
      await this.pollOnce();
      await sleep(jitter(this.config.TRADE_POLL_INTERVAL_MS));
    }
  }

  async pollOnce() {
    if (this.config.WORKER_MODE === "mock") {
      const market = await this.repositories.markets.findIdByExternalId(
        "polymarket",
        "mock-condition-1"
      );

      if (market) {
        const { createMockTrade } = await import("../services/mock-source");
        this.handleTrades([createMockTrade(market)]);
      }
      return;
    }

    const marketRefs = await this.repositories.markets.listActiveMarketRefs(
      "polymarket",
      this.config.MAX_MARKETS_PER_POLL
    );

    if (marketRefs.length === 0) {
      logger.warn("trade_polling.no_markets", {});
      return;
    }

    logger.info("polymarket.trade_poll.start", {
      markets: marketRefs.length,
      limit: this.config.TRADE_POLL_LIMIT
    });
    let rawCount = 0;
    let normalizedCount = 0;

    for (const market of marketRefs) {
      try {
        const lookupId = market.conditionId ?? market.externalId;
        const since = this.lastSeenTradeAt.get(lookupId);
        const byCondition = await this.client.fetchTradesByCondition(lookupId, since);
        const byToken = await this.fetchTokenTrades(market.clobTokenIds ?? [], since);
        const trades = this.dedupeRawTrades([...byCondition, ...byToken]);
        rawCount += trades.length;
        normalizedCount += this.handleRawTrades(lookupId, market.id, trades);
      } catch (error) {
        logger.warn("polymarket.trade_poll.market_failed", {
          externalId: market.externalId,
          conditionId: market.conditionId,
          message: error instanceof Error ? error.message : "Unknown trade polling error"
        });
      }
    }

    logger.info("polymarket.trade_poll.complete", {
      markets: marketRefs.length,
      rawTrades: rawCount,
      normalizedTrades: normalizedCount
    });
  }

  private async fetchTokenTrades(tokenIds: string[], since?: Date) {
    const trades: PolymarketTrade[] = [];

    for (const tokenId of tokenIds.slice(0, 2)) {
      try {
        trades.push(...(await this.client.fetchTradesByToken(tokenId, since)));
      } catch (error) {
        logger.warn("polymarket.trade_poll.token_failed", {
          tokenId,
          message: error instanceof Error ? error.message : "Unknown token trade polling error"
        });
      }
    }

    return trades;
  }

  private dedupeRawTrades(trades: PolymarketTrade[]) {
    const unique = new Map<string, PolymarketTrade>();

    for (const trade of trades) {
      const id =
        trade.transactionHash ??
        trade.txHash ??
        trade.tradeId ??
        trade.id ??
        trade.orderHash ??
        `${trade.market ?? trade.conditionId ?? trade.asset ?? "unknown"}-${trade.timestamp ?? ""}`;
      unique.set(id, trade);
    }

    return [...unique.values()].slice(0, this.config.TRADE_POLL_LIMIT);
  }

  private handleRawTrades(externalMarketId: string, marketId: string, trades: PolymarketTrade[]) {
    const normalized = trades
      .map((trade) => normalizePolymarketTrade(trade, marketId))
      .filter((trade) => trade !== null);

    const newest = normalized.reduce<Date | null>(
      (max, trade) => (!max || trade.tradeTimestamp > max ? trade.tradeTimestamp : max),
      null
    );

    if (newest) {
      this.lastSeenTradeAt.set(externalMarketId, newest);
    }

    this.handleTrades(normalized);
    return normalized.length;
  }

  private handleTrades(trades: NormalizedTrade[]) {
    for (const trade of trades) {
      if (this.seenTradeIds.has(trade.transactionHash)) {
        logger.info("polymarket.trade_deduped", { transactionHash: trade.transactionHash });
        continue;
      }
      this.seenTradeIds.add(trade.transactionHash);
      if (this.seenTradeIds.size > 20_000) {
        this.seenTradeIds = new Set([...this.seenTradeIds].slice(-10_000));
      }

      this.aggregator.add(trade);
      this.tradeBatcher.add(trade);
      this.bus.publish({ type: "trade.normalized", payload: trade });
      this.timelineBatcher.add({
        marketId: trade.marketId,
        eventType: this.config.WORKER_MODE === "live" ? "live_trade_ingested" : "trade",
        eventTimestamp: trade.tradeTimestamp,
        payload: {
          source: trade.source,
          side: trade.side,
          price: trade.price,
          quantity: trade.quantity,
          usdValue: trade.usdValue,
          walletAddress: trade.walletAddress,
          transactionHash: trade.transactionHash,
          clobTokenId: trade.clobTokenId,
          outcome: trade.outcome,
          metadata: trade.metadata
        }
      });

      logger.info("wallet_address.mapped", {
        walletAddress: trade.walletAddress,
        transactionHash: trade.transactionHash,
        source: trade.source
      });
    }
  }

  private startAggregateFlushLoop() {
    setInterval(async () => {
      const candles = this.aggregator.drain();
      if (candles.length === 0) return;

      await this.repositories.aggregates.upsertMany(candles);
      await this.repositories.timeline.appendMany(
        candles.map((candle) => ({
          marketId: candle.marketId,
          eventType: "aggregate_updated",
          eventTimestamp: candle.bucket,
          payload: {
            open: candle.open,
            high: candle.high,
            low: candle.low,
            close: candle.close,
            volume: candle.volume,
            tradeCount: candle.tradeCount
          }
        }))
      );
      this.bus.publish({ type: "aggregate.flush", payload: { count: candles.length } });
      logger.info("aggregates.flushed", { count: candles.length });
    }, this.config.AGGREGATE_FLUSH_INTERVAL_MS);
  }

  private async runWebSocket() {
    let reconnectMs = this.config.RECONNECT_MIN_MS;

    const wsUrl = this.config.POLYMARKET_WS_URL;
    if (!wsUrl) return;

    while (!this.stopped) {
      await new Promise<void>((resolve) => {
        const ws = new WebSocket(wsUrl);

        ws.on("open", () => {
          reconnectMs = this.config.RECONNECT_MIN_MS;
          logger.info("websocket.connected", {});
        });

        ws.on("message", (payload) => {
          void (async () => {
            const parsed = JSON.parse(payload.toString()) as PolymarketTrade | PolymarketTrade[];
            const events = Array.isArray(parsed) ? parsed : [parsed];
            await this.handleWebSocketTrades(events);
            logger.info("websocket.message", { count: events.length });
          })().catch((error: unknown) => {
            logger.warn("websocket.handle_failed", {
              message: error instanceof Error ? error.message : "Unknown websocket error"
            });
          });
        });

        ws.on("close", () => {
          logger.warn("websocket.closed", { reconnectMs });
          resolve();
        });

        ws.on("error", (error) => {
          logger.error("websocket.error", { message: error.message });
          ws.close();
        });
      });

      await sleep(jitter(reconnectMs));
      reconnectMs = Math.min(reconnectMs * 2, this.config.RECONNECT_MAX_MS);
    }
  }

  private async handleWebSocketTrades(events: PolymarketTrade[]) {
    const grouped = new Map<string, PolymarketTrade[]>();

    for (const event of events) {
      const externalMarketId =
        event.conditionId ??
        event.marketId ??
        event.market ??
        event.asset ??
        event.assetId ??
        event.tokenId;
      if (!externalMarketId) continue;

      grouped.set(externalMarketId, [...(grouped.get(externalMarketId) ?? []), event]);
    }

    for (const [externalMarketId, trades] of grouped) {
      const marketId = await this.repositories.markets.findIdByExternalId(
        "polymarket",
        externalMarketId
      );
      const tokenMarketId = marketId
        ? null
        : await this.repositories.markets.findIdByClobTokenId("polymarket", externalMarketId);
      if (!marketId && !tokenMarketId) {
        logger.warn("market_mapping.failed", { externalMarketId });
        continue;
      }
      const resolvedMarketId = marketId ?? tokenMarketId;
      if (!resolvedMarketId) continue;
      this.handleRawTrades(externalMarketId, resolvedMarketId, trades);
    }
  }
}
