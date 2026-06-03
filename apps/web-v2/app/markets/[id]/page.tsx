import { MarketDetailClient } from "@/components/markets/market-detail-client";
import { explorerApi } from "@/lib/api";

export default async function MarketDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [initialMarket, initialHistory] = await Promise.all([
    explorerApi.market(id).catch(() => null),
    explorerApi.history(id).catch(() => null)
  ]);
  return <MarketDetailClient id={id} initialMarket={initialMarket} initialHistory={initialHistory} />;
}
