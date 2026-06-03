export const marketSelect = `
  select
    m.id, m.external_market_id, m.slug, m.title, m.description, m.status,
    m.end_date, m.created_at, m.updated_at,
    v.id as venue_id, v.slug as venue_slug, v.name as venue_name,
    c.id as category_id, c.slug as category_slug, c.name as category_name,
    coalesce(tags.items, '[]'::json) as tags,
    event.id as event_id, event.external_event_id, event.slug as event_slug,
    event.title as event_title,
    coalesce((
      select json_agg(json_build_object(
        'id', o.id,
        'outcomeName', o.outcome_name,
        'probability', case when o.probability is null then null else o.probability::float end,
        'volume', o.volume::float,
        'rank', o.rank,
        'updatedAt', o.updated_at
      ) order by o.rank)
      from market_outcomes o where o.market_id = m.id
    ), '[]'::json) as outcomes,
    coalesce(latest.probability, display_outcome.probability)::text as probability,
    coalesce(latest.volume, m.volume)::text as volume,
    coalesce(latest.liquidity, m.liquidity)::text as liquidity,
    latest.open_interest::text, latest.snapshot_time
  from markets m
  join venues v on v.id = m.venue_id
  left join categories c on c.id = m.primary_category_id
  left join lateral (
    select json_agg(json_build_object(
      'id', vt.id,
      'slug', vt.slug,
      'label', vt.label,
      'source', mt.source
    ) order by vt.label) as items
    from market_tags mt
    join venue_tags vt on vt.id = mt.tag_id
    where mt.market_id = m.id
  ) tags on true
  left join lateral (
    select e.id, e.external_event_id, e.slug, e.title
    from event_markets em
    join events e on e.id = em.event_id
    where em.market_id = m.id
    order by e.updated_at desc
    limit 1
  ) event on true
  left join lateral (
    select probability
    from market_outcomes
    where market_id = m.id
    order by (lower(outcome_name) = 'yes') desc, probability desc nulls last, rank asc, outcome_name asc
    limit 1
  ) display_outcome on true
  left join lateral (
    select probability, volume, liquidity, open_interest, snapshot_time
    from market_snapshots
    where market_id = m.id
    order by snapshot_time desc
    limit 1
  ) latest on true
`;
