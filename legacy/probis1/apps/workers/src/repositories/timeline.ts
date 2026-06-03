import { marketTimeline, type ProbisDatabase } from "@probis/database";
import type { ReplayEvent } from "../types/events";
import { serializeJson } from "../utils/serialization";

export const createTimelineRepository = (db: ProbisDatabase) => ({
  async appendMany(events: ReplayEvent[]) {
    if (events.length === 0) return [];

    return db
      .insert(marketTimeline)
      .values(
        events.map((event) => ({
          marketId: event.marketId,
          eventType: event.eventType,
          eventTimestamp: event.eventTimestamp,
          payload: serializeJson(event.payload)
        }))
      )
      .returning();
  }
});
