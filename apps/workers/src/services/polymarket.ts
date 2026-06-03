import type { WorkerConfig } from "../config/env";
import { logger } from "../utils/logger";

export type GammaToken = {
  outcome?: string;
  name?: string;
  label?: string;
  price?: string | number;
};

export type GammaTag = {
  id?: string | number;
  slug?: string;
  label?: string;
  name?: string;
  type?: string;
};

export type GammaEvent = {
  id?: string;
  slug?: string;
  title?: string;
  description?: string;
  ticker?: string;
  category?: string;
  startDate?: string;
  startTime?: string;
  endDate?: string;
  endDateIso?: string;
  resolutionDate?: string;
  createdAt?: string;
  updatedAt?: string;
  active?: boolean;
  closed?: boolean;
  archived?: boolean;
  closedTime?: string;
  live?: boolean;
  ended?: boolean;
  period?: string;
  finishedTimestamp?: string;
  score?: string;
  automaticallyResolved?: boolean;
  volume?: string | number;
  volume24hr?: string | number;
  liquidity?: string | number;
  openInterest?: string | number;
  tags?: GammaTag[];
  markets?: GammaMarket[];
  stagedMarketIds?: string[];
};

export type GammaMarket = {
  id?: string;
  conditionId?: string;
  slug?: string;
  question?: string;
  title?: string;
  description?: string;
  category?: string;
  tags?: Array<string | GammaTag>;
  events?: GammaEvent[];
  active?: boolean;
  closed?: boolean;
  resolved?: boolean;
  archived?: boolean;
  acceptingOrders?: boolean;
  enableOrderBook?: boolean;
  funded?: boolean;
  endDate?: string;
  endDateIso?: string;
  resolutionDate?: string;
  closedTime?: string;
  updatedAt?: string;
  createdAt?: string;
  outcomes?: string | string[];
  outcomePrices?: string | Array<string | number>;
  clobTokenIds?: string | Array<string | number>;
  tokens?: GammaToken[];
  volume?: string | number;
  volumeNum?: string | number;
  volume24h?: string | number;
  volume24hr?: string | number;
  liquidity?: string | number;
  liquidityNum?: string | number;
  openInterest?: string | number;
  open_interest?: string | number;
  bestBid?: string | number;
  bestAsk?: string | number;
  lastTradePrice?: string | number;
  questionID?: string;
  groupItemTitle?: string;
  sportsMarketType?: string;
  gameStartTime?: string;
  umaResolutionStatus?: string;
  umaResolutionStatuses?: string | string[];
  resolvedBy?: string;
  ready?: boolean;
  approved?: boolean;
  automaticallyResolved?: boolean;
  featured?: boolean;
  new?: boolean;
  competitive?: string | number;
  oneDayPriceChange?: string | number;
  oneHourPriceChange?: string | number;
  oneWeekPriceChange?: string | number;
  period?: string;
  finishedTimestamp?: string;
  eventStartTime?: string;
};

export class PolymarketClient {
  constructor(private readonly config: WorkerConfig) {}

  async fetchActiveEvents(): Promise<GammaEvent[]> {
    return this.fetchEventList("open", this.config.POLYMARKET_EVENT_PAGE_LIMIT, this.config.POLYMARKET_EVENT_MAX_PAGES);
  }

  async fetchClosedEvents(): Promise<GammaEvent[]> {
    return this.fetchEventList("closed", this.config.CLOSED_EVENT_PAGE_LIMIT, this.config.CLOSED_EVENT_MAX_PAGES);
  }

  private async fetchEventList(state: "open" | "closed", limit: number, maxPages: number): Promise<GammaEvent[]> {
    const records: GammaEvent[] = [];
    const seen = new Set<string>();
    const startedAt = Date.now();
    const batchSize = 3;

    for (let firstPage = 0; firstPage < maxPages; firstPage += batchSize) {
      const pages = Array.from(
        { length: Math.min(batchSize, maxPages - firstPage) },
        (_, index) => firstPage + index
      );
      const pageResults = await Promise.all(pages.map((page) => this.fetchEventPage(state, page, limit)));
      let reachedLastPage = false;

      for (const { page, offset, records: pageRecords } of pageResults) {
        for (const record of pageRecords) {
          if (!record.id || seen.has(record.id)) continue;
          seen.add(record.id);
          records.push(record);
        }
        logger.info("polymarket.events.page", {
          state,
          page: page + 1,
          offset,
          returned: pageRecords.length,
          cumulative: records.length
        });
        if (pageRecords.length < this.config.POLYMARKET_EVENT_PAGE_LIMIT) {
          reachedLastPage = true;
          break;
        }
      }

      if (reachedLastPage) break;
    }

    logger.info("polymarket.events.fetch_complete", {
      state,
      events: records.length,
      durationMs: Date.now() - startedAt
    });
    return records;
  }

  async fetchActiveMarkets(): Promise<GammaMarket[]> {
    return this.fetchPaginated<GammaMarket>("/markets", (market) => market.conditionId ?? market.id);
  }

  async fetchEventDetail(externalEventId: string): Promise<GammaEvent | null> {
    const url = new URL(`/events/${encodeURIComponent(externalEventId)}`, this.config.POLYMARKET_GAMMA_API_URL);
    const response = await fetch(url, {
      signal: AbortSignal.timeout(this.config.HTTP_TIMEOUT_MS),
      headers: { accept: "application/json" }
    });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`Gamma /events/${externalEventId} request failed with status ${response.status}`);
    const detail = (await response.json()) as GammaEvent;
    if (!detail || typeof detail !== "object" || String(detail.id ?? "") !== externalEventId) {
      throw new Error(`Gamma /events/${externalEventId} returned malformed detail`);
    }
    return detail;
  }

  private async fetchEventPage(state: "open" | "closed", page: number, limit: number) {
    const offset = page * limit;
    const url = state === "open" ? this.activeUrl("/events", limit, offset) : this.closedUrl("/events", limit, offset);
    const response = await fetch(url, {
      signal: AbortSignal.timeout(this.config.HTTP_TIMEOUT_MS),
      headers: { accept: "application/json" }
    });
    if (!response.ok) throw new Error(`Gamma /events request failed with status ${response.status}`);
    return { page, offset, records: (await response.json()) as GammaEvent[] };
  }

  private async fetchPaginated<T>(pathname: string, keyFor: (record: T) => string | undefined) {
    const records: T[] = [];
    const seen = new Set<string>();
    const batchSize = 5;

    for (let firstPage = 0; firstPage < this.config.MAX_MARKET_FETCH_PAGES; firstPage += batchSize) {
      const pages = Array.from(
        { length: Math.min(batchSize, this.config.MAX_MARKET_FETCH_PAGES - firstPage) },
        (_, index) => firstPage + index
      );
      const pageResults = await Promise.all(pages.map(async (page) => {
        const offset = page * this.config.MARKET_FETCH_LIMIT;
        const response = await fetch(this.activeUrl(pathname, this.config.MARKET_FETCH_LIMIT, offset), {
          signal: AbortSignal.timeout(this.config.HTTP_TIMEOUT_MS),
          headers: { accept: "application/json" }
        });
        if (!response.ok) throw new Error(`Gamma ${pathname} request failed with status ${response.status}`);
        return { page, offset, records: (await response.json()) as T[] };
      }));
      let reachedLastPage = false;
      for (const result of pageResults) {
        for (const record of result.records) {
          const key = keyFor(record);
          if (!key || seen.has(key)) continue;
          seen.add(key);
          records.push(record);
        }
        logger.info("polymarket.records.page", {
          pathname,
          page: result.page + 1,
          offset: result.offset,
          returned: result.records.length,
          cumulative: records.length
        });
        if (result.records.length < this.config.MARKET_FETCH_LIMIT) {
          reachedLastPage = true;
          break;
        }
      }
      if (reachedLastPage) break;
    }

    return records;
  }

  private activeUrl(pathname: string, limit: number, offset: number) {
    const url = new URL(pathname, this.config.POLYMARKET_GAMMA_API_URL);
    url.searchParams.set("active", "true");
    url.searchParams.set("closed", "false");
    url.searchParams.set("limit", String(limit));
    url.searchParams.set("offset", String(offset));
    url.searchParams.set("order", "updatedAt");
    url.searchParams.set("ascending", "false");
    return url;
  }

  private closedUrl(pathname: string, limit: number, offset: number) {
    const url = new URL(pathname, this.config.POLYMARKET_GAMMA_API_URL);
    url.searchParams.set("closed", "true");
    url.searchParams.set("limit", String(limit));
    url.searchParams.set("offset", String(offset));
    url.searchParams.set("order", "updatedAt");
    url.searchParams.set("ascending", "false");
    return url;
  }
}
