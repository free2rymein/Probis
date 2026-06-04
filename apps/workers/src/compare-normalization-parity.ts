import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { config as loadEnv } from "dotenv";
import type postgres from "postgres";
import { loadWorkerConfig } from "./config/env";
import { createWorkerDatabase } from "./services/database";
import {
  createExclusionCounts,
  numberOrNull,
  normalizeEvent,
  stringArray,
  type NormalizedEvent
} from "./services/normalization";
import type { GammaEvent } from "./services/polymarket";
import { PolymarketClient } from "./services/polymarket";
import { StagingRepository, type GammaFeedKind, type RawStagedMarket } from "./services/staging-repository";
import { logger } from "./utils/logger";

const packageEnvPath = resolve(process.cwd(), ".env");
const rootEnvPath = resolve(process.cwd(), "../..", ".env");
loadEnv({ path: rootEnvPath });
if (existsSync(packageEnvPath)) loadEnv({ path: packageEnvPath, override: true });

type CliOptions = {
  batchId: string | null;
  limit: number;
};

type TsEventRow = {
  externalEventId: string;
  title: string;
  slug: string;
  active: boolean;
  closed: boolean;
  archived: boolean;
  endDate: string | null;
  categorySlug: string;
  categoryName: string;
};

type TsMarketRow = {
  externalMarketId: string;
  externalEventId: string;
  title: string;
  active: boolean | null;
  closed: boolean | null;
  archived: boolean | null;
  acceptingOrders: boolean | null;
  enableOrderBook: boolean | null;
  endDate: string | null;
  resolved: boolean | null;
  automaticallyResolved: boolean | null;
  period: string | null;
  finishedTimestamp: string | null;
  categorySlug: string;
  categoryName: string;
};

type OutcomeRow = {
  externalMarketId: string;
  outcomeName: string;
  externalTokenId: string | null;
  probability: string | null;
  rank: number;
};

type SpEventRow = TsEventRow;
type SpMarketRow = TsMarketRow;

type FieldMismatch = {
  id: string;
  field: string;
  ts: unknown;
  sp: unknown;
  reason: string;
};

type CountMismatch = {
  id: string;
  ts: number;
  sp: number;
  reason: string;
};

const parseOptions = (): CliOptions => {
  const batchIdIndex = process.argv.indexOf("--batch-id");
  const limitIndex = process.argv.indexOf("--limit");
  const batchId = batchIdIndex >= 0
    ? process.argv[batchIdIndex + 1] ?? null
    : process.env.GAMMA_STAGING_BATCH_ID ?? null;
  const limit = limitIndex >= 0 ? Number(process.argv[limitIndex + 1]) : Number(process.env.NORMALIZATION_PARITY_LIMIT ?? 20);
  if (batchIdIndex >= 0 && !batchId) throw new Error("--batch-id requires a value");
  if (!Number.isInteger(limit) || limit < 1) throw new Error("--limit must be a positive integer");
  return { batchId, limit };
};

const flattenMarkets = (events: GammaEvent[]) =>
  events.flatMap((event) => (event.markets ?? []).map((market) => ({
    externalEventId: event.id ?? null,
    market
  })));

const iso = (date: Date | null | undefined) => date ? date.toISOString() : null;

const normalizeProbability = (value: string | number | null | undefined) => {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed.toFixed(8) : null;
};

const reasonForField = (field: string) => {
  if (field.toLowerCase().includes("category")) return "category_classifier_difference";
  if (["active", "closed", "archived", "resolved", "automaticallyResolved", "period", "finishedTimestamp"].includes(field)) {
    return "lifecycle_rule_difference";
  }
  if (["acceptingOrders", "enableOrderBook"].includes(field)) return "tradability_rule_difference";
  if (field === "endDate") return "end_date_parsing_difference";
  if (["outcomeName", "probability", "externalTokenId", "rank"].includes(field)) return "outcome_parsing_difference";
  return "unknown";
};

const mapBy = <T>(items: T[], keyFor: (item: T) => string) =>
  new Map(items.map((item) => [keyFor(item), item]));

const groupBy = <T>(items: T[], keyFor: (item: T) => string) => {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = keyFor(item);
    const group = groups.get(key) ?? [];
    group.push(item);
    groups.set(key, group);
  }
  return groups;
};

const sortedDifference = (left: Set<string>, right: Set<string>) =>
  [...left].filter((value) => !right.has(value)).sort();

const stageFreshOpenBatch = async (
  repository: StagingRepository,
  client: PolymarketClient
) => {
  const startedAt = Date.now();
  const feedKind: GammaFeedKind = "open_events";
  const batchId = await repository.createGammaIngestionBatch({
    feedKind,
    metadata: { mode: "parity-compare", command: "compare:normalization-parity" }
  });
  try {
    const events = await client.fetchActiveEvents();
    const markets = flattenMarkets(events);
    const [rawEvents, rawMarkets] = await Promise.all([
      repository.insertRawEvents(batchId, feedKind, events),
      repository.insertRawMarkets(batchId, feedKind, markets)
    ]);
    await repository.markBatchFetched(batchId, {
      eventCount: events.length,
      marketCount: markets.length,
      timings: {
        command: "compare:normalization-parity",
        durationMs: Date.now() - startedAt
      }
    });
    logger.info("normalization_parity.staged_fresh_batch", {
      batchId,
      eventsFetched: events.length,
      marketsFetched: markets.length,
      rawEventRowsInserted: rawEvents.inserted,
      rawMarketRowsInserted: rawMarkets.inserted,
      durationMs: Date.now() - startedAt
    });
    return batchId;
  } catch (error: unknown) {
    await repository.markBatchFailed(batchId, error);
    throw error;
  }
};

const findLatestUsableBatch = async (sql: postgres.Sql) => {
  const [row] = await sql<{ id: string }[]>`
    select batches.id
    from gamma_ingestion_batches batches
    where batches.feed_kind = 'open_events'
      and batches.status in ('fetched', 'normalized')
      and exists (
        select 1 from gamma_raw_events raw
        where raw.batch_id = batches.id
      )
      and exists (
        select 1 from gamma_raw_markets raw
        where raw.batch_id = batches.id
      )
    order by batches.fetched_at desc nulls last, batches.started_at desc
    limit 1
  `;
  return row?.id ?? null;
};

const loadHydratedEvents = async (repository: StagingRepository, batchId: string) => {
  const [rawEventsResult, rawMarketsResult] = await Promise.all([
    repository.getPendingRawEventsWithStats(batchId),
    repository.getPendingRawMarketsWithStats(batchId)
  ]);
  let rawEvents = rawEventsResult.rows;
  let rawMarkets = rawMarketsResult.rows;

  if (rawEvents.length === 0 || rawMarkets.length === 0) {
    const [allEvents, allMarkets] = await Promise.all([
      repository.getRawEventsForBatch(batchId),
      repository.getRawMarketsForBatch(batchId)
    ]);
    rawEvents = allEvents;
    rawMarkets = allMarkets;
  }

  const marketsByExternalId = new Map(rawMarkets.map((rawMarket) => [rawMarket.externalMarketId, rawMarket.payload]));
  const marketsByEventId = new Map<string, RawStagedMarket[]>();
  for (const rawMarket of rawMarkets) {
    if (!rawMarket.externalEventId) continue;
    const eventMarkets = marketsByEventId.get(rawMarket.externalEventId) ?? [];
    eventMarkets.push(rawMarket);
    marketsByEventId.set(rawMarket.externalEventId, eventMarkets);
  }

  const hydratedEvents = rawEvents.map((rawEvent) => ({
    ...rawEvent.payload,
    markets: rawEvent.payload.stagedMarketIds
      ? rawEvent.payload.stagedMarketIds.flatMap((externalMarketId) => {
        const market = marketsByExternalId.get(externalMarketId);
        return market ? [market] : [];
      })
      : rawEvent.payload.markets ?? (marketsByEventId.get(rawEvent.externalEventId) ?? []).map((market) => market.payload)
  }));

  return {
    hydratedEvents,
    rawEventRows: rawEvents.length,
    rawMarketRows: rawMarkets.length,
    rawEvents,
    rawMarkets
  };
};

const normalizeTypescript = (events: GammaEvent[]) => {
  const exclusionCounts = createExclusionCounts();
  const normalizedEvents = events
    .map((event) => normalizeEvent(event, exclusionCounts))
    .filter((event): event is NormalizedEvent => event !== null);

  const eventRows: TsEventRow[] = normalizedEvents.map((event) => ({
    externalEventId: event.externalEventId,
    title: event.title,
    slug: event.slug,
    active: event.active,
    closed: event.closed,
    archived: event.archived,
    endDate: iso(event.endDate),
    categorySlug: event.categorySlug,
    categoryName: event.categoryName
  }));

  const marketRows: TsMarketRow[] = normalizedEvents.flatMap((event) =>
    event.markets.map((market) => ({
      externalMarketId: market.externalMarketId,
      externalEventId: event.externalEventId,
      title: market.title,
      active: market.active,
      closed: market.closed,
      archived: market.archived,
      acceptingOrders: market.acceptingOrders,
      enableOrderBook: market.enableOrderBook,
      endDate: iso(market.endDate),
      resolved: market.resolved,
      automaticallyResolved: market.automaticallyResolved,
      period: market.period,
      finishedTimestamp: iso(market.finishedTimestamp),
      categorySlug: market.categorySlug,
      categoryName: market.categoryName
    }))
  );

  const outcomeRows: OutcomeRow[] = normalizedEvents.flatMap((event) =>
    event.markets.flatMap((market) => market.outcomes.map((outcome) => ({
      externalMarketId: market.externalMarketId,
      outcomeName: outcome.name,
      externalTokenId: outcome.externalTokenId,
      probability: normalizeProbability(outcome.probability),
      rank: outcome.rank
    })))
  );

  return { eventRows, marketRows, outcomeRows, exclusionCounts };
};

type StoredProcedureSnapshot = {
  summary: unknown;
  eventRows: SpEventRow[];
  marketRows: SpMarketRow[];
  outcomeRows: OutcomeRow[];
  rawMarketStatuses: SpRawMarketStatus[];
  eventMarketCount: number;
  marketCategoryCount: number;
};

type SpRawMarketStatus = {
  externalMarketId: string;
  normalizationStatus: string;
  exclusionReasons: string[];
};

type TsOnlyMarketDiagnostic = {
  externalMarketId: string;
  externalEventId: string;
  title: string | null;
  rawFields: Record<string, unknown>;
  tsParsedOutcomeCount: number;
  tsParsedOutcomes: OutcomeRow[];
  spExclusionReason: string[] | null;
  inferredReason: string;
};

type CategoryRuleDiagnostic = {
  categorySlug: string;
  categoryName: string;
  keywords: string[];
};

type CategoryMappingRow = {
  matchType: string;
  matchValue: string;
  categorySlug: string;
  priority: number;
};

type CategoryInputDiagnostic = {
  category: unknown;
  sport: unknown;
  series: unknown;
  tags: Array<{ slug: string | null; label: string | null; name: string | null }>;
};

type CategoryClassifierDiagnostic = {
  source: "event" | "market";
  id: string;
  externalEventId: string;
  externalMarketId: string | null;
  title: string | null;
  question: string | null;
  tsCategory: unknown;
  spCategory: unknown;
  rawEvent: CategoryInputDiagnostic | null;
  rawMarket: CategoryInputDiagnostic | null;
  inheritedEventTags: CategoryInputDiagnostic["tags"];
  marketTags: CategoryInputDiagnostic["tags"];
  tsTagMatch: { categorySlug: string; keyword: string } | null;
  tsTextMatch: { categorySlug: string; keyword: string } | null;
  approximateSqlMappingMatch: CategoryMappingRow | null;
  likelyReason: string;
};

const categoryRuleDiagnostics: CategoryRuleDiagnostic[] = [
  {
    categorySlug: "sports",
    categoryName: "Sports",
    keywords: [
      "esports",
      "sports",
      "nba",
      "nfl",
      "mlb",
      "nhl",
      "soccer",
      "football",
      "ufc",
      "tennis",
      "baseball",
      "basketball",
      "hockey",
      "golf",
      "cricket",
      "formula-1",
      "f1"
    ]
  },
  {
    categorySlug: "geopolitics",
    categoryName: "Geopolitics",
    keywords: ["geopolitics", "iran", "war", "conflict", "russia", "ukraine", "israel", "china", "taiwan"]
  },
  {
    categorySlug: "politics",
    categoryName: "Politics",
    keywords: ["politics", "elections", "election", "president", "senate", "house", "congress"]
  },
  {
    categorySlug: "crypto",
    categoryName: "Crypto",
    keywords: ["crypto", "crypto-prices", "bitcoin", "ethereum", "solana"]
  },
  {
    categorySlug: "macro",
    categoryName: "Macro",
    keywords: [
      "economy",
      "fed-rates",
      "inflation",
      "recession",
      "macro",
      "interest-rates",
      "interest rate",
      "finance",
      "stocks",
      "fed"
    ]
  },
  {
    categorySlug: "technology",
    categoryName: "Technology",
    keywords: ["ai", "tech", "technology", "openai", "nvidia", "tesla", "spacex", "big-tech"]
  },
  {
    categorySlug: "weather",
    categoryName: "Weather",
    keywords: ["weather", "hurricane", "temperature", "climate", "climate-science"]
  },
  {
    categorySlug: "culture",
    categoryName: "Culture",
    keywords: ["oscars", "oscar", "music", "movies", "movie", "culture", "pop-culture", "entertainment", "celebrity"]
  },
  {
    categorySlug: "science",
    categoryName: "Science",
    keywords: ["science", "space", "medicine"]
  }
];

class RollbackWithSnapshot extends Error {
  constructor(readonly snapshot: StoredProcedureSnapshot) {
    super("ROLLBACK_NORMALIZATION_PARITY_PREVIEW");
  }
}

const snapshotStoredProcedureOutput = async (sql: postgres.Sql, batchId: string) => {
  try {
    await sql.begin(async (transaction) => {
      const [procedureResult] = await transaction<{ summary: unknown }[]>`
        select probis2_normalize_gamma_open_batch_prototype(${batchId}) as summary
      `;

      const eventRows = await transaction<SpEventRow[]>`
        select
          e.external_event_id as "externalEventId",
          e.title,
          e.slug,
          e.active,
          e.closed,
          e.archived,
          e.end_date::text as "endDate",
          c.slug as "categorySlug",
          c.name as "categoryName"
        from gamma_raw_events raw
        join events e on e.external_event_id = raw.external_event_id
        left join categories c on c.id = e.primary_category_id
        where raw.batch_id = ${batchId}
          and raw.normalization_status = 'normalized'
        order by e.external_event_id
      `;

      const marketRows = await transaction<SpMarketRow[]>`
        select
          m.external_market_id as "externalMarketId",
          raw.external_event_id as "externalEventId",
          m.title,
          m.active,
          m.closed,
          m.archived,
          m.accepting_orders as "acceptingOrders",
          m.enable_order_book as "enableOrderBook",
          m.end_date::text as "endDate",
          m.resolved,
          m.automatically_resolved as "automaticallyResolved",
          m.period,
          m.finished_timestamp::text as "finishedTimestamp",
          c.slug as "categorySlug",
          c.name as "categoryName"
        from gamma_raw_markets raw
        join markets m on m.external_market_id = raw.external_market_id
        left join categories c on c.id = m.primary_category_id
        where raw.batch_id = ${batchId}
          and raw.normalization_status = 'normalized'
        order by m.external_market_id
      `;

      const outcomeRows = await transaction<OutcomeRow[]>`
        select
          m.external_market_id as "externalMarketId",
          o.outcome_name as "outcomeName",
          o.external_token_id as "externalTokenId",
          o.probability::text as probability,
          o.rank
        from gamma_raw_markets raw
        join markets m on m.external_market_id = raw.external_market_id
        join market_outcomes o on o.market_id = m.id
        where raw.batch_id = ${batchId}
          and raw.normalization_status = 'normalized'
        order by m.external_market_id, o.rank, o.outcome_name
      `;

      const rawMarketStatuses = await transaction<SpRawMarketStatus[]>`
        select
          raw.external_market_id as "externalMarketId",
          raw.normalization_status as "normalizationStatus",
          raw.exclusion_reasons as "exclusionReasons"
        from gamma_raw_markets raw
        where raw.batch_id = ${batchId}
        order by raw.external_market_id
      `;

      const [relationshipCounts] = await transaction<{ event_market_count: number; market_category_count: number }[]>`
        with batch_markets as (
          select m.id
          from gamma_raw_markets raw
          join markets m on m.external_market_id = raw.external_market_id
          where raw.batch_id = ${batchId}
            and raw.normalization_status = 'normalized'
        )
        select
          (select count(*)::int from event_markets em join batch_markets bm on bm.id = em.market_id) as event_market_count,
          (select count(*)::int from market_categories mc join batch_markets bm on bm.id = mc.market_id) as market_category_count
      `;

      const snapshot: StoredProcedureSnapshot = {
        summary: procedureResult?.summary ?? null,
        eventRows: eventRows.map((row) => ({ ...row, endDate: row.endDate ? new Date(row.endDate).toISOString() : null })),
        marketRows: marketRows.map((row) => ({
          ...row,
          endDate: row.endDate ? new Date(row.endDate).toISOString() : null,
          finishedTimestamp: row.finishedTimestamp ? new Date(row.finishedTimestamp).toISOString() : null
        })),
        outcomeRows: outcomeRows.map((row) => ({
          ...row,
          probability: normalizeProbability(row.probability)
        })),
        rawMarketStatuses,
        eventMarketCount: relationshipCounts?.event_market_count ?? 0,
        marketCategoryCount: relationshipCounts?.market_category_count ?? 0
      };

      throw new RollbackWithSnapshot(snapshot);
    });
  } catch (error: unknown) {
    if (error instanceof RollbackWithSnapshot) return error.snapshot;
    throw error;
  }

  throw new Error("Stored-procedure preview produced no snapshot");
};

const compareFields = <T extends object>(
  id: string,
  ts: T,
  sp: T,
  fields: Array<keyof T>
) => {
  const mismatches: FieldMismatch[] = [];
  for (const field of fields) {
    const tsValue = ts[field] as unknown;
    const spValue = sp[field] as unknown;
    if (tsValue !== spValue) {
      mismatches.push({
        id,
        field: String(field),
        ts: tsValue,
        sp: spValue,
        reason: reasonForField(String(field))
      });
    }
  }
  return mismatches;
};

const compareOutcomes = (tsRows: OutcomeRow[], spRows: OutcomeRow[]) => {
  const tsByMarket = groupBy(tsRows, (row) => row.externalMarketId);
  const spByMarket = groupBy(spRows, (row) => row.externalMarketId);
  const marketIds = new Set([...tsByMarket.keys(), ...spByMarket.keys()]);
  const countMismatches: CountMismatch[] = [];
  const fieldMismatches: FieldMismatch[] = [];

  for (const marketId of marketIds) {
    const tsOutcomes = tsByMarket.get(marketId) ?? [];
    const spOutcomes = spByMarket.get(marketId) ?? [];
    if (tsOutcomes.length !== spOutcomes.length) {
      countMismatches.push({
        id: marketId,
        ts: tsOutcomes.length,
        sp: spOutcomes.length,
        reason: "outcome_parsing_difference"
      });
    }

    const tsByRankName = mapBy(tsOutcomes, (row) => `${row.rank}:${row.outcomeName}`);
    const spByRankName = mapBy(spOutcomes, (row) => `${row.rank}:${row.outcomeName}`);
    for (const [key, tsOutcome] of tsByRankName) {
      const spOutcome = spByRankName.get(key);
      if (!spOutcome) continue;
      fieldMismatches.push(...compareFields(`${marketId}:${key}`, tsOutcome, spOutcome, [
        "externalTokenId",
        "probability",
        "rank"
      ]));
    }
  }

  return { countMismatches, fieldMismatches };
};

const rawPayloadFields = (payload: Record<string, unknown>) => ({
  outcomes: payload.outcomes,
  outcomePrices: payload.outcomePrices,
  clobTokenIds: payload.clobTokenIds,
  tokenIds: payload.tokenIds,
  tokens: payload.tokens,
  active: payload.active,
  closed: payload.closed,
  archived: payload.archived,
  acceptingOrders: payload.acceptingOrders,
  accepting_orders: payload.accepting_orders,
  enableOrderBook: payload.enableOrderBook,
  enable_order_book: payload.enable_order_book,
  endDate: payload.endDate,
  end_date: payload.end_date,
  endDateIso: payload.endDateIso,
  resolutionDate: payload.resolutionDate,
  resolved: payload.resolved,
  automaticallyResolved: payload.automaticallyResolved,
  automatically_resolved: payload.automatically_resolved,
  closedTime: payload.closedTime,
  closed_time: payload.closed_time,
  period: payload.period,
  finishedTimestamp: payload.finishedTimestamp,
  finished_timestamp: payload.finished_timestamp,
  groupItemTitle: payload.groupItemTitle,
  sportsMarketType: payload.sportsMarketType,
  gameStartTime: payload.gameStartTime,
  umaResolutionStatus: payload.umaResolutionStatus,
  umaResolutionStatuses: payload.umaResolutionStatuses
});

const tokenOutcomeLabels = (payload: Record<string, unknown>) =>
  Array.isArray(payload.tokens)
    ? payload.tokens.map((token) => {
      if (!token || typeof token !== "object") return "";
      const row = token as Record<string, unknown>;
      return String(row.outcome ?? row.name ?? row.label ?? "");
    })
    : [];

const tokenPrices = (payload: Record<string, unknown>) =>
  Array.isArray(payload.tokens)
    ? payload.tokens.map((token) => {
      if (!token || typeof token !== "object") return undefined;
      return (token as Record<string, unknown>).price;
    })
    : [];

const inferTsOnlyMarketReason = (payload: Record<string, unknown>) => {
  const labels = stringArray(payload.outcomes as string | string[] | Array<string | number> | undefined);
  const prices = stringArray(payload.outcomePrices as string | string[] | Array<string | number> | undefined);
  const tokenLabels = tokenOutcomeLabels(payload);
  const tokenPriceValues = tokenPrices(payload);
  const outcomeLabels = labels.length > 0 ? labels : tokenLabels;
  const normalizedPrices = outcomeLabels.map((_, rank) => numberOrNull(prices[rank] ?? tokenPriceValues[rank]));
  const title = String(payload.question ?? payload.title ?? "").toLowerCase();
  const groupItemTitle = String(payload.groupItemTitle ?? "").toLowerCase();
  const sportsMarketType = String(payload.sportsMarketType ?? "").toLowerCase();

  if (labels.length === 0 && tokenLabels.length > 0) return "token_outcome_fallback_missing";
  if (normalizedPrices.every((price) => price === null) && tokenPriceValues.some((price) => numberOrNull(price) !== null)) {
    return "token_price_fallback_missing";
  }
  if (prices.length !== outcomeLabels.length && normalizedPrices.some((price) => price !== null)) return "null_price_handling";
  if (title.includes("completed match") || groupItemTitle.includes("completed match") || sportsMarketType.includes("completed_match")) {
    return "lifecycle_check_difference";
  }
  if (payload.acceptingOrders !== true || payload.enableOrderBook !== true) return "orderbook_accepting_orders_check";
  if (payload.active !== true || payload.closed !== false || payload.archived !== false) return "lifecycle_check_difference";
  return "unknown";
};

const tsOnlyMarketDiagnostics = (
  marketIds: string[],
  rawMarkets: RawStagedMarket[],
  tsOutcomeRows: OutcomeRow[],
  rawStatuses: SpRawMarketStatus[],
  limit: number
): TsOnlyMarketDiagnostic[] => {
  const rawByMarketId = mapBy(rawMarkets, (row) => row.externalMarketId);
  const tsOutcomesByMarketId = groupBy(tsOutcomeRows, (row) => row.externalMarketId);
  const statusesByMarketId = mapBy(rawStatuses, (row) => row.externalMarketId);

  return marketIds.slice(0, limit).map((externalMarketId) => {
    const raw = rawByMarketId.get(externalMarketId);
    const payload = (raw?.payload ?? {}) as Record<string, unknown>;
    const tsOutcomes = tsOutcomesByMarketId.get(externalMarketId) ?? [];
    return {
      externalMarketId,
      externalEventId: raw?.externalEventId ?? "",
      title: String(payload.question ?? payload.title ?? "") || null,
      rawFields: rawPayloadFields(payload),
      tsParsedOutcomeCount: tsOutcomes.length,
      tsParsedOutcomes: tsOutcomes,
      spExclusionReason: statusesByMarketId.get(externalMarketId)?.exclusionReasons ?? null,
      inferredReason: inferTsOnlyMarketReason(payload)
    };
  });
};

const categoryTags = (payload: Record<string, unknown> | null | undefined): CategoryInputDiagnostic["tags"] => {
  const tags = payload?.tags;
  if (!Array.isArray(tags)) return [];
  return tags
    .filter((tag): tag is Record<string, unknown> => Boolean(tag) && typeof tag === "object")
    .map((tag) => ({
      slug: typeof tag.slug === "string" ? tag.slug : null,
      label: typeof tag.label === "string" ? tag.label : null,
      name: typeof tag.name === "string" ? tag.name : null
    }));
};

const categoryInput = (payload: Record<string, unknown> | null | undefined): CategoryInputDiagnostic | null => {
  if (!payload) return null;
  return {
    category: payload.category,
    sport: payload.sport,
    series: payload.series,
    tags: categoryTags(payload)
  };
};

const tagText = (tags: CategoryInputDiagnostic["tags"]) =>
  tags.flatMap((tag) => [tag.slug, tag.label ?? tag.name].filter(Boolean)).join(" ");

const textParts = (...parts: unknown[]) =>
  parts
    .filter((part): part is string => typeof part === "string" && part.length > 0)
    .join(" ");

const matchesCategoryKeyword = (value: string, keyword: string) =>
  new RegExp(`(^|[^a-z0-9])${keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`, "i").test(value);

const firstCategoryKeywordMatch = (value: string) => {
  for (const rule of categoryRuleDiagnostics) {
    const keyword = rule.keywords.find((candidate) => matchesCategoryKeyword(value, candidate));
    if (keyword) return { categorySlug: rule.categorySlug, keyword };
  }
  return null;
};

const slugifyDiagnosticValue = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const approximateSqlMappingMatch = (
  mappingRows: CategoryMappingRow[],
  payload: Record<string, unknown> | null | undefined,
  tags: CategoryInputDiagnostic["tags"],
  fallbackText: string
) => {
  const exactCandidates: Array<{ matchType: string; value: string }> = [];
  const addExact = (matchType: string, value: unknown, slugify = true) => {
    if (typeof value !== "string" || value.trim().length === 0) return;
    exactCandidates.push({ matchType, value: slugify ? slugifyDiagnosticValue(value) : value.trim().toLowerCase() });
  };

  addExact("category_slug", payload?.category);
  addExact("category_label", payload?.category, false);
  addExact("sport", payload?.sport);
  addExact("series", payload?.series);
  for (const tag of tags) {
    addExact("tag_slug", tag.slug);
    addExact("tag_label", tag.label ?? tag.name, false);
  }

  const matches = mappingRows.filter((row) => {
    const rowValue = row.matchValue.trim().toLowerCase();
    if (row.matchType === "keyword") return matchesCategoryKeyword(fallbackText, row.matchValue);
    return exactCandidates.some((candidate) =>
      candidate.matchType === row.matchType
      && (candidate.value === rowValue || slugifyDiagnosticValue(candidate.value) === rowValue)
    );
  });

  return matches.sort((left, right) =>
    left.priority - right.priority
    || right.matchValue.length - left.matchValue.length
    || left.categorySlug.localeCompare(right.categorySlug)
  )[0] ?? null;
};

const inferCategoryMismatchReason = (
  tsCategory: unknown,
  spCategory: unknown,
  tsTagMatch: { categorySlug: string; keyword: string } | null,
  tsTextMatch: { categorySlug: string; keyword: string } | null,
  sqlMatch: CategoryMappingRow | null
) => {
  const tsSlug = String(tsCategory ?? "").toLowerCase();
  const spSlug = String(spCategory ?? "").toLowerCase();
  if (!sqlMatch && !tsTagMatch && !tsTextMatch) return "unknown";
  if (sqlMatch && sqlMatch.matchType !== "keyword" && sqlMatch.categorySlug === spSlug) return "native_or_exact_mapping_precedence";
  if (sqlMatch && sqlMatch.categorySlug === spSlug && (tsTagMatch || tsTextMatch)) return "sql_mapping_priority_difference";
  if ((tsTagMatch ?? tsTextMatch)?.categorySlug === tsSlug && spSlug === "other") return "missing_or_disabled_sql_keyword";
  if (sqlMatch && sqlMatch.matchType === "keyword" && !categoryRuleDiagnostics.some((rule) =>
    rule.categorySlug === sqlMatch.categorySlug && rule.keywords.includes(sqlMatch.matchValue.toLowerCase())
  )) {
    return "extra_sql_keyword_not_in_typescript_rules";
  }
  return "category_classifier_difference";
};

const categoryMismatchDiagnostics = (
  mismatches: FieldMismatch[],
  rawEvents: Array<{ externalEventId: string; payload: GammaEvent }>,
  rawMarkets: RawStagedMarket[],
  tsMarketsById: Map<string, TsMarketRow>,
  spMarketsById: Map<string, SpMarketRow>,
  mappingRows: CategoryMappingRow[],
  limit: number
): CategoryClassifierDiagnostic[] => {
  const rawEventById = mapBy(rawEvents, (row) => row.externalEventId);
  const rawMarketById = mapBy(rawMarkets, (row) => row.externalMarketId);

  return mismatches.slice(0, limit).map((mismatch) => {
    const tsMarket = tsMarketsById.get(mismatch.id);
    const spMarket = spMarketsById.get(mismatch.id);
    const source = tsMarket || spMarket ? "market" : "event";
    const externalEventId = tsMarket?.externalEventId ?? spMarket?.externalEventId ?? mismatch.id;
    const rawEventPayload = rawEventById.get(externalEventId)?.payload as Record<string, unknown> | undefined;
    const rawMarketPayload = source === "market" ? rawMarketById.get(mismatch.id)?.payload as Record<string, unknown> | undefined : undefined;
    const inheritedEventTags = categoryTags(rawEventPayload);
    const marketTags = categoryTags(rawMarketPayload);
    const combinedTags = source === "market" ? [...inheritedEventTags, ...marketTags] : inheritedEventTags;
    const fallbackText = source === "market"
      ? textParts(rawMarketPayload?.category, rawMarketPayload?.question, rawMarketPayload?.title, rawMarketPayload?.description)
      : textParts(rawEventPayload?.title, rawEventPayload?.description);
    const tsTagMatch = firstCategoryKeywordMatch(tagText(combinedTags));
    const tsTextMatch = tsTagMatch ? null : firstCategoryKeywordMatch(fallbackText);
    const approximateSqlMatch = approximateSqlMappingMatch(
      mappingRows,
      source === "market" ? rawMarketPayload : rawEventPayload,
      combinedTags,
      fallbackText
    );

    return {
      source,
      id: mismatch.id,
      externalEventId,
      externalMarketId: source === "market" ? mismatch.id : null,
      title: String(rawMarketPayload?.title ?? rawMarketPayload?.question ?? rawEventPayload?.title ?? "") || null,
      question: String(rawMarketPayload?.question ?? "") || null,
      tsCategory: mismatch.ts,
      spCategory: mismatch.sp,
      rawEvent: categoryInput(rawEventPayload),
      rawMarket: categoryInput(rawMarketPayload),
      inheritedEventTags,
      marketTags,
      tsTagMatch,
      tsTextMatch,
      approximateSqlMappingMatch: approximateSqlMatch,
      likelyReason: inferCategoryMismatchReason(mismatch.ts, mismatch.sp, tsTagMatch, tsTextMatch, approximateSqlMatch)
    };
  });
};

const topReasons = (mismatches: Array<{ reason: string }>) =>
  [...groupBy(mismatches, (mismatch) => mismatch.reason)]
    .map(([reason, rows]) => ({ reason, count: rows.length }))
    .sort((left, right) => right.count - left.count || left.reason.localeCompare(right.reason));

const categoryMismatchMatrix = (mismatches: FieldMismatch[]) =>
  [...groupBy(mismatches, (mismatch) => `${String(mismatch.ts)} -> ${String(mismatch.sp)}`)]
    .map(([pair, rows]) => {
      const [tsCategory, spCategory] = pair.split(" -> ");
      return {
        tsCategory: tsCategory ?? "unknown",
        spCategory: spCategory ?? "unknown",
        count: rows.length,
        examples: rows.slice(0, 5).map((row) => row.id)
      };
    })
    .sort((left, right) => right.count - left.count || left.tsCategory.localeCompare(right.tsCategory));

const main = async () => {
  const options = parseOptions();
  const config = loadWorkerConfig();
  const { sql, close } = createWorkerDatabase(config, { max: 1, disableIdleTimeout: true });

  try {
    const repository = new StagingRepository(sql, {
      readPageSize: config.RAW_STAGING_READ_PAGE_SIZE,
      writePageSize: config.RAW_STAGING_WRITE_PAGE_SIZE,
      statusUpdateBatchSize: config.RAW_STAGING_STATUS_UPDATE_BATCH_SIZE
    });

    let batchId = options.batchId ?? await findLatestUsableBatch(sql);
    let stagedFreshBatch = false;
    if (!batchId) {
      batchId = await stageFreshOpenBatch(repository, new PolymarketClient(config));
      stagedFreshBatch = true;
    }

    const { hydratedEvents, rawEventRows, rawMarketRows, rawEvents, rawMarkets } = await loadHydratedEvents(repository, batchId);
    const categoryMappingRows = await sql<CategoryMappingRow[]>`
      select
        match_type as "matchType",
        match_value as "matchValue",
        category_slug as "categorySlug",
        priority
      from gamma_tag_category_map
      where source = 'gamma'
        and is_active = true
      order by priority, match_type, match_value
    `;
    const ts = normalizeTypescript(hydratedEvents);
    const sp = await snapshotStoredProcedureOutput(sql, batchId);

    const tsEventsById = mapBy(ts.eventRows, (row) => row.externalEventId);
    const spEventsById = mapBy(sp.eventRows, (row) => row.externalEventId);
    const tsMarketsById = mapBy(ts.marketRows, (row) => row.externalMarketId);
    const spMarketsById = mapBy(sp.marketRows, (row) => row.externalMarketId);
    const tsEventIds = new Set(tsEventsById.keys());
    const spEventIds = new Set(spEventsById.keys());
    const tsMarketIds = new Set(tsMarketsById.keys());
    const spMarketIds = new Set(spMarketsById.keys());

    const eventsOnlyInTs = sortedDifference(tsEventIds, spEventIds);
    const eventsOnlyInSp = sortedDifference(spEventIds, tsEventIds);
    const marketsOnlyInTs = sortedDifference(tsMarketIds, spMarketIds);
    const marketsOnlyInSp = sortedDifference(spMarketIds, tsMarketIds);

    const eventFieldMismatches = [...tsEventIds]
      .filter((id) => spEventsById.has(id))
      .flatMap((id) => compareFields(id, tsEventsById.get(id)!, spEventsById.get(id)!, [
        "title",
        "slug",
        "active",
        "closed",
        "archived",
        "endDate",
        "categorySlug",
        "categoryName"
      ]));

    const marketFieldMismatches = [...tsMarketIds]
      .filter((id) => spMarketsById.has(id))
      .flatMap((id) => compareFields(id, tsMarketsById.get(id)!, spMarketsById.get(id)!, [
        "externalEventId",
        "title",
        "active",
        "closed",
        "archived",
        "acceptingOrders",
        "enableOrderBook",
        "endDate",
        "resolved",
        "automaticallyResolved",
        "period",
        "finishedTimestamp",
        "categorySlug",
        "categoryName"
      ]));

    const outcomeComparison = compareOutcomes(ts.outcomeRows, sp.outcomeRows);
    const categoryMismatches = [...eventFieldMismatches, ...marketFieldMismatches]
      .filter((mismatch) => mismatch.reason === "category_classifier_difference");
    const allReasonedMismatches = [
      ...eventFieldMismatches,
      ...marketFieldMismatches,
      ...outcomeComparison.countMismatches,
      ...outcomeComparison.fieldMismatches
    ];

    const report = {
      batchId,
      stagedFreshBatch,
      rawEventRows,
      rawMarketRows,
      ts: {
        includedEvents: ts.eventRows.length,
        includedMarkets: ts.marketRows.length,
        outcomes: ts.outcomeRows.length,
        exclusionCounts: ts.exclusionCounts
      },
      storedProcedure: {
        includedEvents: sp.eventRows.length,
        includedMarkets: sp.marketRows.length,
        outcomes: sp.outcomeRows.length,
        eventMarkets: sp.eventMarketCount,
        marketCategories: sp.marketCategoryCount,
        summary: sp.summary
      },
      parity: {
        eventsOnlyInTs: eventsOnlyInTs.length,
        eventsOnlyInSp: eventsOnlyInSp.length,
        eventFieldMismatches: eventFieldMismatches.length,
        marketsOnlyInTs: marketsOnlyInTs.length,
        marketsOnlyInSp: marketsOnlyInSp.length,
        marketFieldMismatches: marketFieldMismatches.length,
        outcomeCountMismatches: outcomeComparison.countMismatches.length,
        outcomeFieldMismatches: outcomeComparison.fieldMismatches.length,
        categoryMismatches: categoryMismatches.length,
        unsupportedAreasExcludedFromPassFail: [
          "event_tags",
          "market_tags",
          "closed-feed reconciliation",
          "stale cleanup"
        ],
        reasonCounts: topReasons(allReasonedMismatches),
        categoryMismatchMatrix: categoryMismatchMatrix(categoryMismatches)
      },
      diagnostics: {
        tsOnlyMarkets: tsOnlyMarketDiagnostics(
          marketsOnlyInTs,
          rawMarkets,
          ts.outcomeRows,
          sp.rawMarketStatuses,
          options.limit
        ),
        categoryMismatches: categoryMismatchDiagnostics(
          categoryMismatches,
          rawEvents,
          rawMarkets,
          tsMarketsById,
          spMarketsById,
          categoryMappingRows,
          options.limit
        )
      },
      examples: {
        eventsOnlyInTs: eventsOnlyInTs.slice(0, options.limit),
        eventsOnlyInSp: eventsOnlyInSp.slice(0, options.limit),
        marketsOnlyInTs: marketsOnlyInTs.slice(0, options.limit),
        marketsOnlyInSp: marketsOnlyInSp.slice(0, options.limit),
        eventFieldMismatches: eventFieldMismatches.slice(0, options.limit),
        marketFieldMismatches: marketFieldMismatches.slice(0, options.limit),
        outcomeCountMismatches: outcomeComparison.countMismatches.slice(0, options.limit),
        outcomeFieldMismatches: outcomeComparison.fieldMismatches.slice(0, options.limit),
        categoryMismatches: categoryMismatches.slice(0, options.limit)
      }
    };

    logger.info("normalization_parity.complete", {
      batchId,
      stagedFreshBatch,
      tsIncludedEvents: report.ts.includedEvents,
      spIncludedEvents: report.storedProcedure.includedEvents,
      eventsOnlyInTs: report.parity.eventsOnlyInTs,
      eventsOnlyInSp: report.parity.eventsOnlyInSp,
      tsIncludedMarkets: report.ts.includedMarkets,
      spIncludedMarkets: report.storedProcedure.includedMarkets,
      marketsOnlyInTs: report.parity.marketsOnlyInTs,
      marketsOnlyInSp: report.parity.marketsOnlyInSp,
      outcomeCountMismatches: report.parity.outcomeCountMismatches,
      outcomeFieldMismatches: report.parity.outcomeFieldMismatches,
      categoryMismatches: report.parity.categoryMismatches
    });
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } finally {
    await close();
  }
};

await main();
