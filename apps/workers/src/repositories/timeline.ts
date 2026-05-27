import { marketTimeline, type ProbisDatabase } from "@probis/database";
import type { ReplayEvent } from "../types/events";

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
          payload: event.payload
        }))
      )
      .returning();
  }
});
