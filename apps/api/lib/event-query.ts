export const activeEventStateFilter = `
  e.active = true
  and e.closed = false
  and e.archived = false
  and coalesce(e.ended, false) = false
  and ${explorerLifecycleEligibleEvent("e")}
`;

import { explorerLifecycleEligibleEvent, explorerValidMarket } from "@/lib/explorer-market-filter";
import { explorerEventQualityFilter } from "@/lib/explorer-quality-filter";
import { effectiveResolutionDate, outcomeDisplayOrder } from "@/lib/outcome-ordering";

export const activeEventFilter = `
  ${activeEventStateFilter}
  and ${explorerEventQualityFilter("e")}
  and exists (
    select 1
    from event_markets active_em
    join markets active_m on active_m.id = active_em.market_id
    where active_em.event_id = e.id
      and ${explorerValidMarket("active_m")}
    limit 1
  )
`;

export const eventCardPageSelect = ({ where, orderBy }: { where: string; orderBy: string }) => `
  with ranked_events as (
    select
      e.id, e.external_event_id, e.slug, e.title, e.end_date,
      e.updated_at, e.volume::text, e.volume_24h::text, e.liquidity::text,
      e.open_interest::text,
      v.id as venue_id, v.slug as venue_slug, v.name as venue_name,
      c.id as category_id, c.slug as category_slug, c.name as category_name,
      0::int as market_count,
      row_number() over (order by ${orderBy}) as page_rank
    from events e
    join venues v on v.id = e.venue_id
    left join categories c on c.id = e.primary_category_id
    where ${where}
    order by ${orderBy}
    limit $4 offset $5
  ),
  selected_events as (
    select
      ranked.*,
      coalesce(tags.items, '[]'::json) as tags
    from ranked_events ranked
    left join lateral (
      select json_agg(json_build_object(
        'id', limited_tags.id,
        'slug', limited_tags.slug,
        'label', limited_tags.label,
        'source', 'event'
      ) order by limited_tags.label) as items
      from (
        select vt.id, vt.slug, vt.label
        from event_tags et
        join venue_tags vt on vt.id = et.tag_id
        where et.event_id = ranked.id
        order by vt.label
        limit 2
      ) limited_tags
    ) tags on true
  )
  select
    ranked.*,
    child.market_count,
    coalesce(child.top_markets, '[]'::json) as top_markets,
    child.leader_outcome,
    child.same_resolution_date
  from selected_events ranked
  join lateral (
    with children as (
      select
        m.id,
        coalesce(nullif(m.group_item_title, ''), m.title) as title,
        display_outcome.probability::float as probability,
        ${effectiveResolutionDate({
          title: "coalesce(nullif(m.group_item_title, ''), m.title)",
          endDate: "m.end_date",
          eventEndDate: "ranked.end_date"
        })} as sort_end_date
      from event_markets em
      join markets m on m.id = em.market_id and ${explorerValidMarket("m")}
      left join lateral (
        select probability
        from market_outcomes
        where market_id = m.id
        order by (lower(outcome_name) = 'yes') desc, probability desc nulls last, rank asc, outcome_name asc
        limit 1
      ) display_outcome on true
      where em.event_id = ranked.id
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
          order by ${outcomeDisplayOrder({
            sameResolutionDate: "profile.same_resolution_date",
            probability: "children.probability",
            endDate: "children.sort_end_date",
            tieBreaker: "children.title"
          })}
        ) as preview_rank
      from children
      cross join profile
    )
    select
      count(*)::int as market_count,
      json_agg(json_build_object(
        'id', ranked_children.id,
        'title', ranked_children.title,
        'probability', ranked_children.probability
      ) order by ranked_children.preview_rank) filter (where ranked_children.preview_rank <= 3) as top_markets,
      (
        json_agg(json_build_object(
          'id', ranked_children.id,
          'title', ranked_children.title,
          'probability', ranked_children.probability
        ) order by ranked_children.probability desc nulls last, ranked_children.title asc) -> 0
      ) as leader_outcome,
      bool_and(ranked_children.same_resolution_date) as same_resolution_date
    from ranked_children
  ) child on child.market_count > 0
  order by ranked.page_rank
`;

export const eventSelect = ({
  includeDescription = false,
  tagLimit,
  includeClosedMarkets = false
}: {
  includeDescription?: boolean;
  tagLimit?: number;
  includeClosedMarkets?: boolean;
} = {}) => {
  const childMarketFilter = includeClosedMarkets ? "true" : explorerValidMarket("profile_m");
  const rankedMarketFilter = includeClosedMarkets ? "true" : explorerValidMarket("m");
  return `
  select
    e.id, e.external_event_id, e.slug, e.title, ${includeDescription ? "e.description," : ""}
    e.end_date,
    e.updated_at, e.volume::text, e.volume_24h::text, e.liquidity::text,
    e.open_interest::text,
    v.id as venue_id, v.slug as venue_slug, v.name as venue_name,
    c.id as category_id, c.slug as category_slug, c.name as category_name,
    coalesce(tags.items, '[]'::json) as tags,
    child.market_count,
    coalesce(child.top_markets, '[]'::json) as top_markets,
    child.leader_outcome,
    child.same_resolution_date
  from events e
  join venues v on v.id = e.venue_id
  left join categories c on c.id = e.primary_category_id
  cross join lateral (
    select count(distinct ${effectiveResolutionDate({
      title: "coalesce(nullif(profile_m.group_item_title, ''), profile_m.title)",
      endDate: "profile_m.end_date",
      eventEndDate: "e.end_date"
    })}) <= 1 as same_resolution_date
    from event_markets profile_em
    join markets profile_m on profile_m.id = profile_em.market_id
    where profile_em.event_id = e.id and ${childMarketFilter}
  ) date_profile
  left join lateral (
    select json_agg(json_build_object(
      'id', limited_tags.id,
      'slug', limited_tags.slug,
      'label', limited_tags.label,
      'source', 'event'
    ) order by limited_tags.label) as items
    from (
      select vt.id, vt.slug, vt.label
      from event_tags et
      join venue_tags vt on vt.id = et.tag_id
      where et.event_id = e.id
      order by vt.label
      ${tagLimit ? `limit ${tagLimit}` : ""}
    ) limited_tags
  ) tags on true
  join lateral (
    select
      count(*)::int as market_count,
      json_agg(json_build_object(
        'id', ranked.id,
        'title', ranked.title,
        'probability', ranked.probability
      ) order by ranked.preview_rank) filter (where ranked.preview_rank <= 3) as top_markets
      ,
      (
        json_agg(json_build_object(
          'id', ranked.id,
          'title', ranked.title,
          'probability', ranked.probability
        ) order by ranked.probability desc nulls last, ranked.title asc) -> 0
      ) as leader_outcome,
      bool_and(ranked.same_resolution_date) as same_resolution_date
    from (
      select
        m.id,
        coalesce(nullif(m.group_item_title, ''), m.title) as title,
        display_outcome.probability,
        resolution.sort_end_date,
        date_profile.same_resolution_date,
        row_number() over (
          order by ${outcomeDisplayOrder({
            sameResolutionDate: "date_profile.same_resolution_date",
            probability: "display_outcome.probability",
            endDate: "resolution.sort_end_date",
            tieBreaker: "m.title"
          })}
        ) as preview_rank
      from event_markets em
      join markets m on m.id = em.market_id
      left join lateral (
        select probability::float, volume::float
        from market_outcomes
        where market_id = m.id
        order by (lower(outcome_name) = 'yes') desc, probability desc nulls last, rank asc, outcome_name asc
        limit 1
      ) display_outcome on true
      cross join lateral (
        select ${effectiveResolutionDate({
          title: "coalesce(nullif(m.group_item_title, ''), m.title)",
          endDate: "m.end_date",
          eventEndDate: "e.end_date"
        })} as sort_end_date
      ) resolution
      where em.event_id = e.id
        and ${rankedMarketFilter}
    ) ranked
  ) child on child.market_count > 0
`;
};
