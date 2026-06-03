import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import type {
  categories,
  eventMarkets,
  events,
  eventTags,
  explorerEventCards,
  gammaIngestionBatches,
  gammaRawEvents,
  gammaRawMarkets,
  marketCategories,
  marketOutcomes,
  markets,
  marketSnapshots,
  marketTags,
  venueTags,
  venues
} from "./tables";

export type Venue = InferSelectModel<typeof venues>;
export type NewVenue = InferInsertModel<typeof venues>;

export type Category = InferSelectModel<typeof categories>;
export type NewCategory = InferInsertModel<typeof categories>;

export type Market = InferSelectModel<typeof markets>;
export type NewMarket = InferInsertModel<typeof markets>;

export type MarketOutcome = InferSelectModel<typeof marketOutcomes>;
export type NewMarketOutcome = InferInsertModel<typeof marketOutcomes>;

export type MarketSnapshot = InferSelectModel<typeof marketSnapshots>;
export type NewMarketSnapshot = InferInsertModel<typeof marketSnapshots>;

export type Event = InferSelectModel<typeof events>;
export type NewEvent = InferInsertModel<typeof events>;

export type VenueTag = InferSelectModel<typeof venueTags>;
export type NewVenueTag = InferInsertModel<typeof venueTags>;

export type EventMarket = InferSelectModel<typeof eventMarkets>;
export type NewEventMarket = InferInsertModel<typeof eventMarkets>;

export type EventTag = InferSelectModel<typeof eventTags>;
export type NewEventTag = InferInsertModel<typeof eventTags>;

export type MarketTag = InferSelectModel<typeof marketTags>;
export type NewMarketTag = InferInsertModel<typeof marketTags>;

export type MarketCategory = InferSelectModel<typeof marketCategories>;
export type NewMarketCategory = InferInsertModel<typeof marketCategories>;

export type GammaIngestionBatch = InferSelectModel<typeof gammaIngestionBatches>;
export type NewGammaIngestionBatch = InferInsertModel<typeof gammaIngestionBatches>;

export type GammaRawEvent = InferSelectModel<typeof gammaRawEvents>;
export type NewGammaRawEvent = InferInsertModel<typeof gammaRawEvents>;

export type GammaRawMarket = InferSelectModel<typeof gammaRawMarkets>;
export type NewGammaRawMarket = InferInsertModel<typeof gammaRawMarkets>;

export type ExplorerEventCard = InferSelectModel<typeof explorerEventCards>;
export type NewExplorerEventCard = InferInsertModel<typeof explorerEventCards>;
