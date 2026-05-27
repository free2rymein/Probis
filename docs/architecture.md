# Probis Architecture

Probis separates presentation, API boundaries, domain types, persistence helpers, and future intelligence workers into independently deployable units.

The first production boundary is simple:

- Web requests render institutional dashboard surfaces.
- API route handlers provide typed JSON contracts and structured logging.
- Shared packages keep domain contracts consistent across apps.
- Workers will consume market, wallet, replay, and alert jobs without coupling to the web runtime.

This keeps compute low while preserving clear scaling paths for realtime ingestion, anomaly scoring, and AI summarization.
