import { effectiveResolutionDate, outcomeDisplayOrder } from "@/lib/outcome-ordering";
import { explorerValidMarket } from "@/lib/explorer-market-filter";

export const associatedMarketsSelect = ({ includeClosedMarkets = false }: {
  includeClosedMarkets?: boolean;
} = {}) => `
  with associated as (
    select
      m.id, m.title, m.group_item_title, m.volume, m.one_day_price_change,
      ${effectiveResolutionDate({
        title: "coalesce(nullif(m.group_item_title, ''), m.title)",
        endDate: "m.end_date",
        eventEndDate: "e.end_date"
      })} as end_date,
      m.updated_at
    from event_markets em
    join markets m on m.id = em.market_id
    join events e on e.id = em.event_id
    where em.event_id = $1::uuid and ${includeClosedMarkets ? "true" : explorerValidMarket("m")}
  ),
  outcomes as (
    select
      o.market_id,
      max(o.probability) filter (where lower(o.outcome_name) = 'yes') as yes_probability,
      max(o.probability) filter (where lower(o.outcome_name) = 'no') as no_probability,
      max(o.volume) filter (where lower(o.outcome_name) = 'yes') as yes_volume
    from market_outcomes o
    join associated a on a.id = o.market_id
    group by o.market_id
  ),
  historical_24h as (
    select distinct on (s.market_id)
      s.market_id, s.probability
    from market_snapshots s
    join associated a on a.id = s.market_id
    where s.snapshot_time <= now() - interval '24 hours'
    order by s.market_id, s.snapshot_time desc
  ),
  date_profile as (
    select count(distinct end_date) <= 1 as same_resolution_date
    from associated
  )
  select
    a.id,
    coalesce(nullif(a.group_item_title, ''), a.title) as title,
    a.end_date,
    o.yes_probability::text,
    o.no_probability::text,
    coalesce(a.volume, o.yes_volume)::text as volume,
    coalesce(
      a.one_day_price_change,
      case
        when o.yes_probability is not null and h.probability is not null
        then o.yes_probability - h.probability
        else null
      end
    )::text as probability_change_24h
  from associated a
  left join outcomes o on o.market_id = a.id
  left join historical_24h h on h.market_id = a.id
  cross join date_profile d
  order by ${outcomeDisplayOrder({
    sameResolutionDate: "d.same_resolution_date",
    probability: "o.yes_probability",
    endDate: "a.end_date",
    tieBreaker: "a.title"
  })}
`;
