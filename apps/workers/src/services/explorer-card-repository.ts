import type postgres from "postgres";
import type { WorkerConfig } from "../config/env";

export type ExplorerCardRefreshStats = {
  refreshGeneration: string;
  cardsBuilt: number;
  visibleCards: number;
  hiddenOrExcludedCards: number;
  hiddenFromNewCards: number;
  durationMs: number;
  timingBreakdown: Record<string, number>;
};

export class ExplorerCardRepository {
  constructor(
    private readonly sql: postgres.Sql,
    private readonly config: Pick<WorkerConfig, "MIN_EVENT_VOLUME" | "MIN_EVENT_LIQUIDITY" | "MIN_EVENT_VOLUME_24H">
  ) {}

  async refresh(): Promise<ExplorerCardRefreshStats> {
    const startedAt = Date.now();
    const stats = await this.sql.begin(async (transaction) => {
      const timings: Record<string, number> = {};
      const timed = async <T>(name: string, task: () => Promise<T>) => {
        const phaseStartedAt = Date.now();
        try {
          return await task();
        } finally {
          timings[name] = Date.now() - phaseStartedAt;
        }
      };
      const [generation] = await transaction<{ id: string }[]>`select gen_random_uuid() as id`;
      if (!generation) throw new Error("Unable to generate explorer card refresh generation");

      await timed("upsertCardsMs", () => transaction`
        insert into explorer_event_cards (
          event_id, external_event_id, venue_id, venue_slug, venue_name, event_slug, title, search_text,
          category_id, category_slug, category_name, tags, volume, volume_24h, liquidity, open_interest,
          end_date, event_updated_at, market_count, top_markets, leader_outcome, same_resolution_date,
          outcome_ordering, is_explorer_visible, hidden_from_new, exclusion_reasons, refresh_generation,
          refreshed_at
        )
        select
          e.id,
          e.external_event_id,
          v.id,
          v.slug,
          v.name,
          e.slug,
          e.title,
          lower(e.title),
          c.id,
          c.slug,
          c.name,
          coalesce(tags.items, '[]'::jsonb),
          e.volume,
          e.volume_24h,
          e.liquidity,
          e.open_interest,
          e.end_date,
          e.updated_at,
          coalesce(child.market_count, 0),
          coalesce(child.top_markets, '[]'::jsonb),
          child.leader_outcome,
          child.same_resolution_date,
          case when child.same_resolution_date then 'probability' else 'resolution_date' end,
          (
            e.active = true
            and e.closed = false
            and e.archived = false
            and coalesce(e.ended, false) = false
            and e.closed_time is null
            and coalesce(e.automatically_resolved, false) = false
            and lower(coalesce(e.period, '')) <> 'ft'
            and e.finished_timestamp is null
            and coalesce(e.volume, 0) >= ${this.config.MIN_EVENT_VOLUME}
            and coalesce(e.liquidity, 0) >= ${this.config.MIN_EVENT_LIQUIDITY}
            and coalesce(e.volume_24h, 0) >= ${this.config.MIN_EVENT_VOLUME_24H}
            and coalesce(child.market_count, 0) > 0
          ),
          hidden.hidden_from_new,
          array_remove(array[
            case when e.active is distinct from true then 'event_inactive' end,
            case when e.closed is distinct from false then 'event_closed' end,
            case when e.archived is distinct from false then 'event_archived' end,
            case when coalesce(e.ended, false) then 'event_ended' end,
            case when e.closed_time is not null then 'event_closed_time_present' end,
            case when coalesce(e.automatically_resolved, false) then 'event_automatically_resolved' end,
            case when lower(coalesce(e.period, '')) = 'ft' then 'completed_sports_period_ft' end,
            case when e.finished_timestamp is not null then 'completed_finished_timestamp' end,
            case when coalesce(e.volume, 0) < ${this.config.MIN_EVENT_VOLUME} then 'below_min_event_volume' end,
            case when coalesce(e.liquidity, 0) < ${this.config.MIN_EVENT_LIQUIDITY} then 'below_min_event_liquidity' end,
            case when coalesce(e.volume_24h, 0) < ${this.config.MIN_EVENT_VOLUME_24H} then 'below_min_event_volume_24h' end,
            case when coalesce(child.market_count, 0) = 0 then 'no_explorer_eligible_markets' end
          ], null),
          ${generation.id},
          now()
        from events e
        join venues v on v.id = e.venue_id
        left join categories c on c.id = e.primary_category_id
        left join lateral (
          select coalesce(jsonb_agg(jsonb_build_object(
            'id', limited_tags.id,
            'slug', limited_tags.slug,
            'label', limited_tags.label,
            'source', 'event'
          ) order by limited_tags.label), '[]'::jsonb) as items
          from (
            select vt.id, vt.slug, vt.label
            from event_tags et
            join venue_tags vt on vt.id = et.tag_id
            where et.event_id = e.id
            order by vt.label
            limit 2
          ) limited_tags
        ) tags on true
        cross join lateral (
          select exists (
            select 1
            from event_tags hidden_et
            join venue_tags hidden_tag on hidden_tag.id = hidden_et.tag_id
            where hidden_et.event_id = e.id
              and hidden_tag.slug = 'hide-from-new'
          ) as hidden_from_new
        ) hidden
        left join lateral (
          with children as (
            select
              m.id,
              coalesce(nullif(m.group_item_title, ''), m.title) as title,
              display_outcome.probability::float as probability,
              case
                when coalesce(nullif(m.group_item_title, ''), m.title)
                  ~* '^(january|february|march|april|may|june|july|august|september|october|november|december) [0-9]{1,2}$'
                then to_date(
                  coalesce(nullif(m.group_item_title, ''), m.title)
                    || ' ' || extract(year from coalesce(e.end_date, m.end_date, now()))::int::text,
                  'Month DD YYYY'
                )::timestamptz
                else m.end_date
              end as sort_end_date
            from event_markets em
            join markets m on m.id = em.market_id
              and m.status = 'open'
              and m.active = true
              and m.closed = false
              and m.archived = false
              and m.accepting_orders = true
              and m.enable_order_book = true
              and m.end_date >= now()
              and m.closed_time is null
              and coalesce(m.resolved, false) = false
              and coalesce(m.automatically_resolved, false) = false
              and lower(coalesce(m.uma_resolution_status, '')) <> 'resolved'
              and lower(coalesce(m.period, '')) <> 'ft'
              and m.finished_timestamp is null
              and not (
                lower(coalesce(m.group_item_title, '')) = 'completed match'
                and (
                  lower(coalesce(m.sports_market_type, '')) like '%completed_match%'
                  or lower(m.title) like '%: completed match:%'
                  or (
                    m.game_start_time <= now()
                    and lower(coalesce(m.uma_resolution_status, '')) in ('proposed', 'resolved')
                  )
                )
              )
            left join lateral (
              select probability
              from market_outcomes
              where market_id = m.id
              order by (lower(outcome_name) = 'yes') desc, probability desc nulls last, rank asc, outcome_name asc
              limit 1
            ) display_outcome on true
            where em.event_id = e.id
          ),
          profile as (
            select count(distinct sort_end_date) <= 1 as same_resolution_date
            from children
          ),
          ranked_children as (
            select
              children.*,
              profile.same_resolution_date,
              row_number() over (
                order by
                  case when profile.same_resolution_date then children.probability end desc nulls last,
                  case when not profile.same_resolution_date then children.sort_end_date end asc nulls last,
                  children.probability desc nulls last,
                  children.title asc
              ) as preview_rank
            from children
            cross join profile
          )
          select
            count(*)::int as market_count,
            jsonb_agg(jsonb_build_object(
              'id', ranked_children.id,
              'title', ranked_children.title,
              'probability', ranked_children.probability
            ) order by ranked_children.preview_rank) filter (where ranked_children.preview_rank <= 3) as top_markets,
            (
              jsonb_agg(jsonb_build_object(
                'id', ranked_children.id,
                'title', ranked_children.title,
                'probability', ranked_children.probability
              ) order by ranked_children.probability desc nulls last, ranked_children.title asc) -> 0
            ) as leader_outcome,
            bool_and(ranked_children.same_resolution_date) as same_resolution_date
          from ranked_children
        ) child on true
        on conflict (event_id) do update set
          external_event_id = excluded.external_event_id,
          venue_id = excluded.venue_id,
          venue_slug = excluded.venue_slug,
          venue_name = excluded.venue_name,
          event_slug = excluded.event_slug,
          title = excluded.title,
          search_text = excluded.search_text,
          category_id = excluded.category_id,
          category_slug = excluded.category_slug,
          category_name = excluded.category_name,
          tags = excluded.tags,
          volume = excluded.volume,
          volume_24h = excluded.volume_24h,
          liquidity = excluded.liquidity,
          open_interest = excluded.open_interest,
          end_date = excluded.end_date,
          event_updated_at = excluded.event_updated_at,
          market_count = excluded.market_count,
          top_markets = excluded.top_markets,
          leader_outcome = excluded.leader_outcome,
          same_resolution_date = excluded.same_resolution_date,
          outcome_ordering = excluded.outcome_ordering,
          is_explorer_visible = excluded.is_explorer_visible,
          hidden_from_new = excluded.hidden_from_new,
          exclusion_reasons = excluded.exclusion_reasons,
          refresh_generation = excluded.refresh_generation,
          refreshed_at = excluded.refreshed_at
      `);

      await timed("deleteOldGenerationsMs", () => transaction`
        delete from explorer_event_cards
        where refresh_generation <> ${generation.id}
      `);

      const [counts] = await timed("countCardsMs", () => transaction<{
        cards_built: number;
        visible_cards: number;
        hidden_or_excluded_cards: number;
        hidden_from_new_cards: number;
      }[]>`
        select
          count(*)::int as cards_built,
          count(*) filter (where is_explorer_visible)::int as visible_cards,
          count(*) filter (where not is_explorer_visible)::int as hidden_or_excluded_cards,
          count(*) filter (where hidden_from_new)::int as hidden_from_new_cards
        from explorer_event_cards
        where refresh_generation = ${generation.id}
      `);

      return {
        refreshGeneration: generation.id,
        cardsBuilt: counts?.cards_built ?? 0,
        visibleCards: counts?.visible_cards ?? 0,
        hiddenOrExcludedCards: counts?.hidden_or_excluded_cards ?? 0,
        hiddenFromNewCards: counts?.hidden_from_new_cards ?? 0,
        timingBreakdown: timings
      };
    });

    stats.timingBreakdown.totalMs = Date.now() - startedAt;
    return { ...stats, durationMs: Date.now() - startedAt };
  }
}
