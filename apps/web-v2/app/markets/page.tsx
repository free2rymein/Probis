import { MarketsExplorerClient } from "@/components/markets/markets-explorer-client";
import { explorerApi } from "@/lib/api";

export default async function MarketsPage({ searchParams }: { searchParams: Promise<{ venue?: string }> }) {
  const params = await searchParams;
  const initialVenue = params.venue ?? "polymarket";
  const prefetchStartedAt = performance.now();
  const eventParams = new URLSearchParams({
    venue: initialVenue,
    limit: "50",
    offset: "0",
    sort: "trending"
  });
  const [categories, events] = await Promise.allSettled([
    explorerApi.categories(initialVenue),
    explorerApi.events(eventParams)
  ]);
  console.warn(JSON.stringify({
    level: "info",
    scope: "web",
    event: "markets.prefetch.complete",
    venue: initialVenue,
    durationMs: Number((performance.now() - prefetchStartedAt).toFixed(1)),
    categories: categories.status,
    events: events.status
  }));
  return (
    <MarketsExplorerClient
      initialVenue={initialVenue}
      initialCategories={categories.status === "fulfilled" ? categories.value : null}
      initialEvents={events.status === "fulfilled" ? events.value : null}
    />
  );
}
