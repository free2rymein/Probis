import type { NormalizedTrade, ReplayEvent } from "../types/events";

export type RealtimeEvent =
  | { type: "trade.normalized"; payload: NormalizedTrade }
  | { type: "timeline.event"; payload: ReplayEvent }
  | { type: "aggregate.flush"; payload: { count: number } };

export type RealtimeSubscriber = (event: RealtimeEvent) => void | Promise<void>;

export class RealtimeEventBus {
  private readonly subscribers = new Set<RealtimeSubscriber>();

  subscribe(subscriber: RealtimeSubscriber) {
    this.subscribers.add(subscriber);
    return () => this.subscribers.delete(subscriber);
  }

  publish(event: RealtimeEvent) {
    for (const subscriber of this.subscribers) {
      void subscriber(event);
    }
  }
}
