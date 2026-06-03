create extension if not exists pg_trgm;

create index if not exists explorer_event_cards_visible_filter_count_idx
  on explorer_event_cards (venue_slug, is_explorer_visible, hidden_from_new);

create index if not exists explorer_event_cards_visible_trending_idx
  on explorer_event_cards (
    venue_slug,
    volume_24h desc nulls last,
    volume desc nulls last,
    liquidity desc nulls last,
    open_interest desc nulls last,
    event_updated_at desc nulls last,
    event_id
  )
  where is_explorer_visible = true and hidden_from_new = false;

create index if not exists explorer_event_cards_search_text_trgm_idx
  on explorer_event_cards using gin (search_text gin_trgm_ops)
  where is_explorer_visible = true;
