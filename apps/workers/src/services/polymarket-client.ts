import type { WorkerConfig } from "../config/env";
import type { PolymarketMarket, PolymarketTrade } from "../types/polymarket";
import { fetchJson } from "../utils/http";
import { logger } from "../utils/logger";

export class PolymarketClient {
  constructor(private readonly config: WorkerConfig) {}

  async fetchActiveMarkets(limit: number, offset = 0): Promise<PolymarketMarket[]> {
    const url = new URL("/markets", this.config.POLYMARKET_GAMMA_API_URL);
    if (this.config.MARKET_SYNC_ACTIVE_ONLY) {
      url.searchParams.set("active", "true");
      url.searchParams.set("closed", "false");
    }
    url.searchParams.set("limit", limit.toString());
    url.searchParams.set("offset", offset.toString());
    url.searchParams.set("order", "updatedAt");
    url.searchParams.set("ascending", "false");

    return fetchJson<PolymarketMarket[]>(url, this.config);
  }

  async fetchTradesByCondition(conditionId: string, since?: Date): Promise<PolymarketTrade[]> {
    const url = new URL("/trades", this.config.POLYMARKET_CLOB_API_URL);
    url.searchParams.set("market", conditionId);
    url.searchParams.set("limit", this.config.TRADE_POLL_LIMIT.toString());

    if (since) {
      url.searchParams.set("after", Math.floor(since.getTime() / 1000).toString());
    }

    return fetchJson<PolymarketTrade[]>(url, this.config);
  }

  async fetchTradesByToken(tokenId: string, since?: Date): Promise<PolymarketTrade[]> {
    const url = new URL("/trades", this.config.POLYMARKET_CLOB_API_URL);
    url.searchParams.set("asset_id", tokenId);
    url.searchParams.set("limit", this.config.TRADE_POLL_LIMIT.toString());

    if (since) {
      url.searchParams.set("after", Math.floor(since.getTime() / 1000).toString());
    }

    return fetchJson<PolymarketTrade[]>(url, this.config);
  }

  async fetchDataApiTrades(conditionIds: string[]): Promise<PolymarketTrade[]> {
    if (conditionIds.length === 0) return [];

    const url = new URL("/trades", this.config.POLYMARKET_DATA_API_URL);
    url.searchParams.set("market", conditionIds.join(","));
    url.searchParams.set("limit", this.config.TRADE_POLL_LIMIT.toString());
    url.searchParams.set("takerOnly", this.config.TRADE_POLL_TAKER_ONLY ? "true" : "false");

    const trades = await fetchJson<PolymarketTrade[]>(url, this.config);
    logger.info("polymarket.data_api.trade_chunk.complete", {
      markets: conditionIds.length,
      trades: trades.length
    });
    return trades;
  }
}
