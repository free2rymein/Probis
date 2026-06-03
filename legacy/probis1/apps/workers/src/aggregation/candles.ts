import type { NormalizedTrade } from "../types/events";
import { floorToMinute } from "../utils/time";

export type CandleUpdate = {
  marketId: string;
  bucket: Date;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
  tradeCount: number;
};

type MutableCandle = CandleUpdate & {
  firstTradeAt: number;
  lastTradeAt: number;
};

export class OneMinuteAggregator {
  private readonly candles = new Map<string, MutableCandle>();

  add(trade: NormalizedTrade) {
    const bucket = floorToMinute(trade.tradeTimestamp);
    const key = `${trade.marketId}:${bucket.toISOString()}`;
    const price = Number(trade.price);
    const volume = Number(trade.usdValue);
    const timestamp = trade.tradeTimestamp.getTime();
    const existing = this.candles.get(key);

    if (!existing) {
      this.candles.set(key, {
        marketId: trade.marketId,
        bucket,
        open: trade.price,
        high: trade.price,
        low: trade.price,
        close: trade.price,
        volume: volume.toString(),
        tradeCount: 1,
        firstTradeAt: timestamp,
        lastTradeAt: timestamp
      });
      return;
    }

    if (timestamp < existing.firstTradeAt) {
      existing.open = trade.price;
      existing.firstTradeAt = timestamp;
    }

    if (timestamp >= existing.lastTradeAt) {
      existing.close = trade.price;
      existing.lastTradeAt = timestamp;
    }

    existing.high = Math.max(Number(existing.high), price).toString();
    existing.low = Math.min(Number(existing.low), price).toString();
    existing.volume = (Number(existing.volume) + volume).toString();
    existing.tradeCount += 1;
  }

  drain(): CandleUpdate[] {
    const drained = [...this.candles.values()].map(
      ({ firstTradeAt: _first, lastTradeAt: _last, ...candle }) => candle
    );
    this.candles.clear();
    return drained;
  }

  get size() {
    return this.candles.size;
  }
}
