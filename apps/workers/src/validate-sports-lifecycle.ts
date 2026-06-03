import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { config as loadEnv } from "dotenv";
import { loadWorkerConfig } from "./config/env";
import { createWorkerDatabase } from "./services/database";

const packageEnvPath = resolve(process.cwd(), ".env");
const rootEnvPath = resolve(process.cwd(), "../..", ".env");
loadEnv({ path: rootEnvPath });
if (existsSync(packageEnvPath)) loadEnv({ path: packageEnvPath, override: true });

const strictTradable = (alias = "") => {
  const column = (name: string) => alias ? `${alias}.${name}` : name;
  return `
    ${column("status")} = 'open'
    and ${column("active")} = true
    and ${column("closed")} = false
    and ${column("archived")} = false
    and ${column("accepting_orders")} = true
    and ${column("enable_order_book")} = true
    and ${column("end_date")} >= now()
  `;
};

const completedSportsArtifact = (alias = "") => {
  const column = (name: string) => alias ? `${alias}.${name}` : name;
  return `
    lower(coalesce(${column("group_item_title")}, '')) = 'completed match'
    and (
      lower(coalesce(${column("sports_market_type")}, '')) like '%completed_match%'
      or lower(${column("title")}) like '%: completed match:%'
      or (
        ${column("game_start_time")} <= now()
        and lower(coalesce(${column("uma_resolution_status")}, '')) in ('proposed', 'resolved')
      )
    )
  `;
};

const minEventVolume = Number(process.env.MIN_EVENT_VOLUME ?? 5_000);
const minEventLiquidity = Number(process.env.MIN_EVENT_LIQUIDITY ?? 500);
const minEventVolume24h = Number(process.env.MIN_EVENT_VOLUME_24H ?? 0);
const eventQuality = `
  coalesce(e.volume, 0) >= ${minEventVolume}
  and coalesce(e.liquidity, 0) >= ${minEventLiquidity}
  and coalesce(e.volume_24h, 0) >= ${minEventVolume24h}
`;

const { sql, close } = createWorkerDatabase(loadWorkerConfig());

try {
  const [summary] = await sql`
    select
      count(*) filter (where ${sql.unsafe(completedSportsArtifact())})::int as retained_completed_artifacts,
      count(*) filter (
        where ${sql.unsafe(strictTradable())}
          and ${sql.unsafe(completedSportsArtifact())}
      )::int as baseline_visible_completed_artifacts,
      count(*) filter (
        where ${sql.unsafe(strictTradable())}
          and not (${sql.unsafe(completedSportsArtifact())})
          and lower(coalesce(group_item_title, '')) = 'completed match'
      )::int as explorer_visible_completed_match_rows,
      count(*) filter (
        where ${sql.unsafe(strictTradable())}
          and not (${sql.unsafe(completedSportsArtifact())})
          and lower(title) like any (array['%roland garros%completed match%', '%birmingham%completed match%'])
      )::int as explorer_visible_roland_garros_or_birmingham_artifacts,
      count(*) filter (
        where ${sql.unsafe(strictTradable())}
          and not (${sql.unsafe(completedSportsArtifact())})
          and sports_market_type is not null
          and lower(coalesce(group_item_title, '')) <> 'completed match'
      )::int as explorer_visible_legitimate_sports_markets,
      count(*) filter (where sports_market_type is not null)::int as markets_with_sports_market_type,
      count(*) filter (where game_start_time is not null)::int as markets_with_game_start_time,
      count(*) filter (where uma_resolution_status is not null)::int as markets_with_uma_resolution_status,
      count(*) filter (where cardinality(uma_resolution_statuses) > 0)::int as markets_with_uma_resolution_statuses,
      count(*) filter (where resolved_by is not null)::int as markets_with_resolved_by,
      count(*) filter (where ready is not null)::int as markets_with_ready,
      count(*) filter (where approved is not null)::int as markets_with_approved,
      coalesce(sum(pg_column_size(row(
        sports_market_type, game_start_time, uma_resolution_status,
        uma_resolution_statuses, resolved_by, ready, approved
      ))), 0)::bigint as approximate_lifecycle_storage_bytes
    from markets
  `;

  const legitimateSamples = await sql`
    select title, group_item_title, sports_market_type, game_start_time
    from markets
    where ${sql.unsafe(strictTradable())}
      and not (${sql.unsafe(completedSportsArtifact())})
      and sports_market_type is not null
      and lower(coalesce(group_item_title, '')) <> 'completed match'
    order by updated_at desc
    limit 5
  `;

  const [eventSummary] = await sql`
    select
      (select count(*)::int from events) as total_stored_events,
      count(*) filter (
        where exists (
          select 1
          from event_markets em
          join markets m on m.id = em.market_id
          where em.event_id = e.id and ${sql.unsafe(strictTradable("m"))}
        )
      )::int as explorer_events_before_lifecycle,
      count(*) filter (
        where exists (
          select 1
          from event_markets em
          join markets m on m.id = em.market_id
          where em.event_id = e.id
            and ${sql.unsafe(strictTradable("m"))}
            and not (${sql.unsafe(completedSportsArtifact("m"))})
        )
      )::int as explorer_events_after_lifecycle,
      count(*) filter (
        where exists (
          select 1
          from event_markets em
          join markets m on m.id = em.market_id
          where em.event_id = e.id
            and ${sql.unsafe(strictTradable("m"))}
            and not (${sql.unsafe(completedSportsArtifact("m"))})
        )
        and not (${sql.unsafe(eventQuality)})
      )::int as events_hidden_by_thresholds,
      count(*) filter (
        where exists (
          select 1
          from event_markets em
          join markets m on m.id = em.market_id
          where em.event_id = e.id
            and ${sql.unsafe(strictTradable("m"))}
            and not (${sql.unsafe(completedSportsArtifact("m"))})
        )
        and ${sql.unsafe(eventQuality)}
      )::int as final_visible_explorer_events
    from events e
    where e.active = true and e.closed = false and e.archived = false and coalesce(e.ended, false) = false
  `;

  const [reconciliationSummary] = await sql`
    select
      count(*) filter (where last_lifecycle_checked_at is not null)::int as lifecycle_checked_events,
      count(*) filter (
        where closed = true or ended = true or automatically_resolved = true
      )::int as stored_closed_or_ended_events,
      count(*) filter (
        where (closed = true or ended = true or automatically_resolved = true)
          and active = true and archived = false and coalesce(ended, false) = false
          and ${sql.unsafe(eventQuality)}
          and exists (
            select 1
            from event_markets em
            join markets m on m.id = em.market_id
            where em.event_id = e.id
              and ${sql.unsafe(strictTradable("m"))}
              and not (${sql.unsafe(completedSportsArtifact("m"))})
          )
      )::int as explorer_visible_closed_or_ended_events
    from events e
  `;

  const [rolandGarrosStaleEvent] = await sql`
    select
      e.id,
      e.external_event_id,
      e.title,
      e.active,
      e.closed,
      e.ended,
      e.live,
      e.period,
      e.finished_timestamp,
      e.score,
      e.automatically_resolved,
      e.last_lifecycle_checked_at,
      (
        e.active = true and e.closed = false and e.archived = false
        and ${sql.unsafe(eventQuality)}
        and exists (
          select 1
          from event_markets em
          join markets m on m.id = em.market_id
          where em.event_id = e.id
            and ${sql.unsafe(strictTradable("m"))}
            and not (${sql.unsafe(completedSportsArtifact("m"))})
        )
      ) as explorer_visible
    from events e
    where e.external_event_id = '542642'
    limit 1
  `;

  const [sportsValidation] = await sql`
    select
      count(distinct e.id) filter (
        where e.active = true and e.closed = false and e.archived = false and coalesce(e.ended, false) = false
          and ${sql.unsafe(eventQuality)}
          and exists (
            select 1
            from event_markets em
            join markets m on m.id = em.market_id
            where em.event_id = e.id
              and ${sql.unsafe(strictTradable("m"))}
              and not (${sql.unsafe(completedSportsArtifact("m"))})
              and m.sports_market_type is not null
          )
      )::int as visible_sports_events,
      count(*) filter (
        where e.title in (
          'Roland Garros ATP: Juan Manuel Cerundolo vs Matteo Berrettini',
          'Roland Garros WTA: Anastasia Potapova vs Anna Kalinskaya'
        )
          and e.active = true and e.closed = false and e.archived = false and coalesce(e.ended, false) = false
          and ${sql.unsafe(eventQuality)}
          and exists (
            select 1
            from event_markets em
            join markets m on m.id = em.market_id
            where em.event_id = e.id
              and ${sql.unsafe(strictTradable("m"))}
              and not (${sql.unsafe(completedSportsArtifact("m"))})
          )
      )::int as target_roland_garros_visible_events
    from events e
  `;

  const thresholdHiddenDetailSamples = await sql`
    select e.id, e.title
    from events e
    where e.active = true and e.closed = false and e.archived = false
      and not (${sql.unsafe(eventQuality)})
      and exists (
        select 1
        from event_markets em
        join markets m on m.id = em.market_id
        where em.event_id = e.id
          and ${sql.unsafe(strictTradable("m"))}
          and not (${sql.unsafe(completedSportsArtifact("m"))})
      )
    order by e.updated_at desc
    limit 3
  `;

  console.warn(JSON.stringify({
    thresholds: { minEventVolume, minEventLiquidity, minEventVolume24h },
    summary,
    eventSummary,
    reconciliationSummary,
    rolandGarrosStaleEvent,
    sportsValidation,
    thresholdHiddenDetailSamples,
    legitimateSamples
  }, null, 2));
} finally {
  await close();
}
