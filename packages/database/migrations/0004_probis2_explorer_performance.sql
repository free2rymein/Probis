create index if not exists market_outcomes_yes_market_idx
  on market_outcomes (market_id)
  include (probability)
  where lower(outcome_name) = 'yes';
