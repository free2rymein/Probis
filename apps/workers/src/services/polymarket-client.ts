import type { WorkerConfig } from "../config/env";
import type { PolymarketMarket, PolymarketTrade } from "../types/polymarket";
import { fetchJson } from "../utils/http";

export class PolymarketClient {
  constructor(private readonly config: WorkerConfig) {}

  async fetchActiveMarkets(limit: number, offset = 0): Promise<PolymarketMarket[]> {
    const url = new URL("/markets", this.config.POLYMARKET_GAMMA_API_URL);
    url.searchParams.set("active", "true");
    url.searchParams.set("closed", "false");
    url.searchParams.set("limit", limit.toString());
    url.searchParams.set("offset", offset.toString());
    url.searchParams.set("order", "updatedAt");
    url.searchParams.set("ascending", "false");

    return fetchJson<PolymarketMarket[]>(url, this.config);
  }

  async fetchTrades(conditionId: string, since?: Date): Promise<PolymarketTrade[]> {
    const url = new URL("/trades", this.config.POLYMARKET_CLOB_API_URL);
    url.searchParams.set("market", conditionId);

    if (since) {
      url.searchParams.set("after", Math.floor(since.getTime() / 1000).toString());
    }

    return fetchJson<PolymarketTrade[]>(url, this.config);
  }
}
