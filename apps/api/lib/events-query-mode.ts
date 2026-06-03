import { z } from "zod";

const eventsQueryModeSchema = z.enum(["legacy", "read-model", "read-model-with-legacy-fallback"]);

export type EventsQueryMode = z.infer<typeof eventsQueryModeSchema>;

export const getEventsQueryMode = (): EventsQueryMode =>
  eventsQueryModeSchema.parse(process.env.EVENTS_QUERY_MODE ?? "legacy");
