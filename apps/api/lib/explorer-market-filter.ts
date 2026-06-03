export const explorerTradableMarket = (alias: string) => `
  ${alias}.status = 'open'
  and ${alias}.active = true
  and ${alias}.closed = false
  and ${alias}.archived = false
  and ${alias}.accepting_orders = true
  and ${alias}.enable_order_book = true
  and ${alias}.end_date >= now()
`;

export const explorerLifecycleEligibleMarket = (alias: string) => `
  ${alias}.closed_time is null
  and coalesce(${alias}.resolved, false) = false
  and coalesce(${alias}.automatically_resolved, false) = false
  and lower(coalesce(${alias}.uma_resolution_status, '')) <> 'resolved'
  and lower(coalesce(${alias}.period, '')) <> 'ft'
  and ${alias}.finished_timestamp is null
  and
  not (
    lower(coalesce(${alias}.group_item_title, '')) = 'completed match'
    and (
      lower(coalesce(${alias}.sports_market_type, '')) like '%completed_match%'
      or lower(${alias}.title) like '%: completed match:%'
      or (
        ${alias}.game_start_time <= now()
        and lower(coalesce(${alias}.uma_resolution_status, '')) in ('proposed', 'resolved')
      )
    )
  )
`;

export const explorerLifecycleEligibleEvent = (alias: string) => `
  ${alias}.closed_time is null
  and coalesce(${alias}.automatically_resolved, false) = false
  and lower(coalesce(${alias}.period, '')) <> 'ft'
  and ${alias}.finished_timestamp is null
`;

export const explorerValidMarket = (alias: string) => `
  ${explorerTradableMarket(alias)}
  and ${explorerLifecycleEligibleMarket(alias)}
`;
