import { MarketDetailClient } from "@/components/markets/market-detail-client";

export default async function MarketDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <MarketDetailClient id={id} />;
}
