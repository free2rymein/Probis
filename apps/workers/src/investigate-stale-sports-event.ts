import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { config as loadEnv } from "dotenv";
import { loadWorkerConfig } from "./config/env";
import { createWorkerDatabase } from "./services/database";

const packageEnvPath = resolve(process.cwd(), ".env");
const rootEnvPath = resolve(process.cwd(), "../..", ".env");
loadEnv({ path: rootEnvPath });
if (existsSync(packageEnvPath)) loadEnv({ path: packageEnvPath, override: true });

const search = process.argv.slice(2).find((argument) => argument !== "--")
  ?? "Roland Garros ATP: Juan Manuel Cerundolo vs Matteo Berrettini";
const { sql, close } = createWorkerDatabase(loadWorkerConfig());

try {
  const events = await sql`
    select
      e.id,
      e.external_event_id,
      e.slug,
      e.title,
      e.active,
      e.closed,
      e.archived,
      e.start_date,
      e.end_date,
      e.volume,
      e.volume_24h,
      e.liquidity,
      e.open_interest,
      e.updated_at,
      c.slug as category_slug,
      c.name as category_name,
      coalesce(
        json_agg(json_build_object(
          'id', vt.id,
          'slug', vt.slug,
          'label', vt.label
        ) order by vt.label) filter (where vt.id is not null),
        '[]'::json
      ) as tags
    from events e
    left join categories c on c.id = e.primary_category_id
    left join event_tags et on et.event_id = e.id
    left join venue_tags vt on vt.id = et.tag_id
    where lower(e.title) like ${`%${search.toLowerCase()}%`}
    group by e.id, c.slug, c.name
    order by e.updated_at desc
  `;

  const eventIds = events.map((event) => event.id);
  const markets = eventIds.length === 0 ? [] : await sql`
    select
      em.event_id,
      m.id,
      m.external_market_id,
      m.slug,
      m.title,
      m.group_item_title,
      m.sports_market_type,
      m.game_start_time,
      m.uma_resolution_status,
      m.uma_resolution_statuses,
      m.resolved_by,
      m.ready,
      m.approved,
      m.status,
      m.active,
      m.closed,
      m.archived,
      m.accepting_orders,
      m.enable_order_book,
      m.closed_time,
      m.end_date,
      m.volume,
      m.volume_24h,
      m.liquidity,
      m.updated_at,
      (
        m.status = 'open'
        and m.active = true
        and m.closed = false
        and m.archived = false
        and m.accepting_orders = true
        and m.enable_order_book = true
        and m.end_date >= now()
      ) as strict_tradable,
      not (
        lower(coalesce(m.group_item_title, '')) = 'completed match'
        and (
          lower(coalesce(m.sports_market_type, '')) like '%completed_match%'
          or lower(m.title) like '%: completed match:%'
          or (
            m.game_start_time <= now()
            and lower(coalesce(m.uma_resolution_status, '')) in ('proposed', 'resolved')
          )
        )
      ) as lifecycle_eligible,
      coalesce(
        json_agg(json_build_object(
          'id', o.id,
          'outcome_name', o.outcome_name,
          'probability', o.probability,
          'external_token_id', o.external_token_id,
          'rank', o.rank,
          'updated_at', o.updated_at
        ) order by o.rank) filter (where o.id is not null),
        '[]'::json
      ) as outcomes
    from event_markets em
    join markets m on m.id = em.market_id
    left join market_outcomes o on o.market_id = m.id
    where em.event_id in ${sql(eventIds)}
    group by em.event_id, m.id
    order by m.updated_at desc, m.title
  `;

  const summaries = events.map((event) => {
    const children = markets.filter((market) => market.event_id === event.id);
    const validChildren = children.filter((market) => market.strict_tradable && market.lifecycle_eligible);
    return {
      event_id: event.id,
      external_event_id: event.external_event_id,
      event_quality_eligible:
        Number(event.volume ?? 0) >= 5_000
        && Number(event.liquidity ?? 0) >= 500
        && Number(event.volume_24h ?? 0) >= 0,
      child_count: children.length,
      strict_tradable_child_count: children.filter((market) => market.strict_tradable).length,
      lifecycle_eligible_child_count: children.filter((market) => market.lifecycle_eligible).length,
      explorer_valid_child_count: validChildren.length,
      explorer_valid_yes_outcome_child_count: validChildren.filter((market) =>
        market.outcomes.some((outcome: { outcome_name: string }) => outcome.outcome_name.toLowerCase() === "yes")
      ).length,
      explorer_valid_children_with_displayable_stored_probabilities: validChildren.filter((market) =>
        market.outcomes.some((outcome: { probability: string | number | null }) => outcome.probability !== null)
      ).length
    };
  });

  console.warn(JSON.stringify({ search, summaries, events, markets }, null, 2));
} finally {
  await close();
}
