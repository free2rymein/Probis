import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import postgres from "postgres";

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

type Sort = "trending" | "volume" | "newest" | "ending-soon";
type Scenario = {
  name: string;
  category?: string;
  search?: string;
  sort: Sort;
};

const scenarios: Scenario[] = [
  { name: "default trending", sort: "trending" },
  { name: "search iran", search: "iran", sort: "trending" },
  { name: "sports category", category: "sports", sort: "trending" },
  { name: "sort volume", sort: "volume" },
  { name: "sort newest", sort: "newest" },
  { name: "ending-soon", sort: "ending-soon" }
];

const orderBy: Record<Sort, string> = {
  trending: "cards.volume_24h desc nulls last, cards.volume desc nulls last, cards.liquidity desc nulls last, cards.open_interest desc nulls last, cards.event_updated_at desc nulls last, cards.event_id asc",
  volume: "cards.volume desc nulls last, cards.volume_24h desc nulls last, cards.liquidity desc nulls last, cards.event_id asc",
  newest: "cards.event_updated_at desc nulls last, cards.event_id asc",
  "ending-soon": "cards.end_date asc nulls last, cards.event_id asc"
};

const buildWhere = (scenario: Scenario) => {
  const clauses = [
    "cards.is_explorer_visible = true",
    "cards.venue_slug = 'polymarket'"
  ];
  if (scenario.category) clauses.push(`cards.category_slug = '${scenario.category}'`);
  if (scenario.search) clauses.push(`cards.search_text ilike '%${scenario.search}%'`);
  if (!scenario.category) clauses.push("cards.hidden_from_new = false");
  return clauses.join("\n    and ");
};

const sql = postgres(process.env.DATABASE_URL, {
  max: 1,
  prepare: false,
  idle_timeout: 20,
  connect_timeout: 10
});

const explain = async (statement: string) =>
  sql.unsafe<Array<{ "QUERY PLAN": string }>>(`explain (analyze, buffers, format text) ${statement}`);

try {
  for (const scenario of scenarios) {
    const where = buildWhere(scenario);
    console.warn(`\n=== ${scenario.name}: count ===`);
    for (const row of await explain(`select count(*)::int from explorer_event_cards cards where ${where}`)) {
      console.warn(row["QUERY PLAN"]);
    }
    console.warn(`\n=== ${scenario.name}: cards ===`);
    for (const row of await explain(`
      select cards.event_id, cards.title, cards.top_markets, cards.leader_outcome
      from explorer_event_cards cards
      where ${where}
      order by ${orderBy[scenario.sort]}
      limit 50 offset 0
    `)) {
      console.warn(row["QUERY PLAN"]);
    }
    console.warn(`\n=== ${scenario.name}: combined read-model miss ===`);
    const ranking = orderBy[scenario.sort].replaceAll("cards.", "filtered.");
    for (const row of await explain(`
      with filtered as materialized (
        select cards.event_id, cards.volume_24h, cards.volume, cards.liquidity,
          cards.open_interest, cards.event_updated_at, cards.end_date
        from explorer_event_cards cards
        where ${where}
      ),
      page as (
        select filtered.event_id, row_number() over (order by ${ranking}) as page_rank
        from filtered
        order by ${ranking}
        limit 50 offset 0
      ),
      total as (
        select count(*)::int as total from filtered
      )
      select cards.event_id, cards.title, cards.top_markets, cards.leader_outcome, total.total
      from total
      left join page on true
      left join explorer_event_cards cards on cards.event_id = page.event_id
      order by page.page_rank
    `)) {
      console.warn(row["QUERY PLAN"]);
    }
  }
} finally {
  await sql.end();
}
