import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import postgres from "postgres";
import { activeEventFilter, eventCardPageSelect } from "../lib/event-query";
import type { EventCardPageRow } from "../lib/event-serializer";

const loadEnvFile = (path: string) => {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    const key = match?.[1];
    const value = match?.[2];
    if (!key || value === undefined || process.env[key]) continue;
    process.env[key] = value.trim().replace(/^"(.*)"$/, "$1");
  }
};

loadEnvFile(resolve(process.cwd(), "../..", ".env"));
loadEnvFile(resolve(process.cwd(), ".env.local"));

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");

type Sort = "trending" | "volume" | "open-interest" | "newest" | "ending-soon";
type Scenario = {
  name: string;
  category?: string;
  search?: string;
  sort?: Sort;
  limit?: number;
  offset?: number;
};

type Preview = {
  id: string;
  title: string;
  probability: number | null;
};

type ComparableCard = {
  id: string;
  title: string;
  category: string | null;
  volume: number | null;
  volume24h: number | null;
  liquidity: number | null;
  openInterest: number | null;
  marketCount: number;
  topMarkets: Preview[];
  leaderOutcome: Preview | null;
  outcomeOrdering: "probability" | "resolution_date";
};

type QueryResult = {
  total: number;
  cards: ComparableCard[];
};

type Freshness = {
  refreshed_at: Date | null;
  cards: number;
  core_events_updated_after_refresh: number;
};

type ReadModelRow = {
  id: string;
  title: string;
  category_name: string | null;
  volume: string | null;
  volume_24h: string | null;
  liquidity: string | null;
  open_interest: string | null;
  market_count: number;
  top_markets: Preview[] | null;
  leader_outcome: Preview | null;
  outcome_ordering: "probability" | "resolution_date";
};

const scenarios: Scenario[] = [
  { name: "default trending" },
  { name: "sports category", category: "sports" },
  { name: "politics category", category: "politics" },
  { name: "geopolitics category", category: "geopolitics" },
  { name: "crypto category", category: "crypto" },
  { name: "search Iran", search: "Iran" },
  { name: "sort volume", sort: "volume" },
  { name: "sort open-interest", sort: "open-interest" },
  { name: "sort newest", sort: "newest" },
  { name: "sort ending-soon", sort: "ending-soon" },
  { name: "pagination offset 50", limit: 50, offset: 50 }
];

const legacyOrderBy: Record<Sort, string> = {
  trending: "e.volume_24h desc nulls last, e.volume desc nulls last, e.liquidity desc nulls last, e.open_interest desc nulls last, e.updated_at desc nulls last, e.id asc",
  volume: "e.volume desc nulls last, e.volume_24h desc nulls last, e.liquidity desc nulls last, e.id asc",
  "open-interest": "e.open_interest desc nulls last, e.volume desc nulls last, e.id asc",
  newest: "e.updated_at desc nulls last, e.id asc",
  "ending-soon": "e.end_date asc nulls last, e.id asc"
};

const readModelOrderBy: Record<Sort, string> = {
  trending: "cards.volume_24h desc nulls last, cards.volume desc nulls last, cards.liquidity desc nulls last, cards.open_interest desc nulls last, cards.event_updated_at desc nulls last, cards.event_id asc",
  volume: "cards.volume desc nulls last, cards.volume_24h desc nulls last, cards.liquidity desc nulls last, cards.event_id asc",
  "open-interest": "cards.open_interest desc nulls last, cards.volume desc nulls last, cards.event_id asc",
  newest: "cards.event_updated_at desc nulls last, cards.event_id asc",
  "ending-soon": "cards.end_date asc nulls last, cards.event_id asc"
};

const numberOrNull = (value: string | number | null | undefined) => {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const preview = (value: Preview | null): Preview | null => value ? ({
  id: value.id,
  title: value.title,
  probability: numberOrNull(value.probability)
}) : null;

const previews = (values: Preview[] | null | undefined) => (values ?? []).map((value) => preview(value)!);

const legacyCard = (row: EventCardPageRow): ComparableCard => ({
  id: row.id,
  title: row.title,
  category: row.category_name,
  volume: numberOrNull(row.volume),
  volume24h: numberOrNull(row.volume_24h),
  liquidity: numberOrNull(row.liquidity),
  openInterest: numberOrNull(row.open_interest),
  marketCount: row.market_count,
  topMarkets: previews(row.top_markets),
  leaderOutcome: preview(row.leader_outcome),
  outcomeOrdering: row.same_resolution_date ? "probability" : "resolution_date"
});

const readModelCard = (row: ReadModelRow): ComparableCard => ({
  id: row.id,
  title: row.title,
  category: row.category_name,
  volume: numberOrNull(row.volume),
  volume24h: numberOrNull(row.volume_24h),
  liquidity: numberOrNull(row.liquidity),
  openInterest: numberOrNull(row.open_interest),
  marketCount: row.market_count,
  topMarkets: previews(row.top_markets),
  leaderOutcome: preview(row.leader_outcome),
  outcomeOrdering: row.outcome_ordering
});

const sql = postgres(process.env.DATABASE_URL, { max: 3, prepare: false, idle_timeout: 20, connect_timeout: 10 });

const legacyQuery = async (scenario: Scenario): Promise<QueryResult> => {
  const category = scenario.category ?? null;
  const search = scenario.search ? `%${scenario.search}%` : null;
  const sort = scenario.sort ?? "trending";
  const limit = scenario.limit ?? 50;
  const offset = scenario.offset ?? 0;
  const spamFilter = category
    ? "true"
    : `not exists (
        select 1 from event_tags spam_et
        join venue_tags spam_tag on spam_tag.id = spam_et.tag_id
        where spam_et.event_id = e.id and spam_tag.slug = 'hide-from-new'
      )`;
  const where = `
    ${activeEventFilter}
    and ($1::text is null or v.slug = $1)
    and ($2::text is null or c.slug = $2)
    and ($3::text is null or e.title ilike $3)
    and ${spamFilter}
  `;
  const params = [null, category, search];
  const [countRows, rows] = await Promise.all([
    sql.unsafe<Array<{ total: number }>>(
      `select count(*)::int as total
       from events e
       join venues v on v.id = e.venue_id
       left join categories c on c.id = e.primary_category_id
       where ${where}`,
      params
    ),
    sql.unsafe<EventCardPageRow[]>(
      eventCardPageSelect({ where, orderBy: legacyOrderBy[sort] }),
      [...params, limit, offset]
    )
  ]);
  return { total: countRows[0]?.total ?? 0, cards: rows.map(legacyCard) };
};

const readModelQuery = async (scenario: Scenario): Promise<QueryResult> => {
  const category = scenario.category ?? null;
  const search = scenario.search ? `%${scenario.search}%` : null;
  const sort = scenario.sort ?? "trending";
  const limit = scenario.limit ?? 50;
  const offset = scenario.offset ?? 0;
  const where = `
    cards.is_explorer_visible = true
    and ($1::text is null or cards.venue_slug = $1)
    and ($2::text is null or cards.category_slug = $2)
    and ($3::text is null or cards.search_text ilike $3)
    and ($2::text is not null or cards.hidden_from_new = false)
  `;
  const params = [null, category, search];
  const [countRows, rows] = await Promise.all([
    sql.unsafe<Array<{ total: number }>>(
      `select count(*)::int as total from explorer_event_cards cards where ${where}`,
      params
    ),
    sql.unsafe<ReadModelRow[]>(
      `select
        event_id as id, title, category_name, volume::text, volume_24h::text,
        liquidity::text, open_interest::text, market_count, top_markets,
        leader_outcome, outcome_ordering
       from explorer_event_cards cards
       where ${where}
       order by ${readModelOrderBy[sort]}
       limit $4 offset $5`,
      [...params, limit, offset]
    )
  ]);
  return { total: countRows[0]?.total ?? 0, cards: rows.map(readModelCard) };
};

const comparableFields: Array<keyof Omit<ComparableCard, "id">> = [
  "title",
  "category",
  "volume",
  "volume24h",
  "liquidity",
  "openInterest",
  "marketCount",
  "topMarkets",
  "leaderOutcome",
  "outcomeOrdering"
];

const stable = (value: unknown) => JSON.stringify(value);

const compareScenario = async (scenario: Scenario) => {
  const [legacy, readModel] = await Promise.all([legacyQuery(scenario), readModelQuery(scenario)]);
  const legacyIds = legacy.cards.map((card) => card.id);
  const readModelIds = readModel.cards.map((card) => card.id);
  const legacySet = new Set(legacyIds);
  const readModelSet = new Set(readModelIds);
  const missingIds = legacyIds.filter((id) => !readModelSet.has(id));
  const extraIds = readModelIds.filter((id) => !legacySet.has(id));
  const missingTitles = legacy.cards
    .filter((card) => missingIds.includes(card.id))
    .slice(0, 10)
    .map(({ id, title }) => ({ id, title }));
  const extraTitles = readModel.cards
    .filter((card) => extraIds.includes(card.id))
    .slice(0, 10)
    .map(({ id, title }) => ({ id, title }));
  const orderingMismatches = legacyIds.flatMap((id, index) => readModelIds[index] === id ? [] : [{
    position: index,
    legacyId: id,
    readModelId: readModelIds[index] ?? null
  }]);
  const readModelById = new Map(readModel.cards.map((card) => [card.id, card]));
  const fieldMismatches = legacy.cards.flatMap((legacyItem) => {
    const readModelItem = readModelById.get(legacyItem.id);
    if (!readModelItem) return [];
    return comparableFields.flatMap((field) =>
      stable(legacyItem[field]) === stable(readModelItem[field])
        ? []
        : [{ id: legacyItem.id, title: legacyItem.title, field, legacy: legacyItem[field], readModel: readModelItem[field] }]
    );
  });
  const passed = legacy.total === readModel.total
    && missingIds.length === 0
    && extraIds.length === 0
    && orderingMismatches.length === 0
    && fieldMismatches.length === 0;
  return {
    scenario,
    passed,
    legacyTotal: legacy.total,
    readModelTotal: readModel.total,
    countDifference: readModel.total - legacy.total,
    legacyIds,
    readModelIds,
    missingIds,
    extraIds,
    missingTitles,
    extraTitles,
    orderingMismatches,
    fieldMismatches
  };
};

try {
  const [freshness] = await sql<Freshness[]>`
    select
      max(refreshed_at) as refreshed_at,
      count(*)::int as cards,
      (
        select count(*)::int
        from events
        where updated_at > max(explorer_event_cards.refreshed_at)
      ) as core_events_updated_after_refresh
    from explorer_event_cards
  `;
  console.warn("READ MODEL FRESHNESS", freshness ?? null);
  const results = [];
  for (const scenario of scenarios) {
    const result = await compareScenario(scenario);
    results.push(result);
    console.warn(`\n${result.passed ? "PASS" : "FAIL"} ${result.scenario.name}`);
    console.warn(`  totals: legacy=${result.legacyTotal} read-model=${result.readModelTotal} difference=${result.countDifference}`);
    console.warn(`  legacy IDs: ${result.legacyIds.join(", ") || "(none)"}`);
    console.warn(`  read-model IDs: ${result.readModelIds.join(", ") || "(none)"}`);
    if (result.missingIds.length > 0) console.warn(`  missing from read model: ${result.missingIds.join(", ")}`);
    if (result.extraIds.length > 0) console.warn(`  extra in read model: ${result.extraIds.join(", ")}`);
    if (result.missingTitles.length > 0) console.warn("  sample missing titles:", result.missingTitles);
    if (result.extraTitles.length > 0) console.warn("  sample extra titles:", result.extraTitles);
    if (result.orderingMismatches.length > 0) console.warn("  ordering mismatches:", result.orderingMismatches.slice(0, 10));
    if (result.fieldMismatches.length > 0) console.warn("  field mismatches:", result.fieldMismatches.slice(0, 10));
  }
  const passed = results.filter((result) => result.passed).length;
  const failed = results.length - passed;
  console.warn(`\nSUMMARY scenarios=${results.length} passed=${passed} failed=${failed}`);
  if (failed > 0) {
    const likelyCause = (freshness?.core_events_updated_after_refresh ?? 0) > 0
      ? `Read model is stale: ${freshness?.core_events_updated_after_refresh} core events were updated after its latest refresh.`
      : "Review visibility parity, ordering ties, or card-field aggregation differences.";
    console.warn(`LIKELY CAUSE ${likelyCause}`);
    process.exitCode = 1;
  }
} finally {
  await sql.end();
}
