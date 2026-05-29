import { PageShell } from "@/components/layout/page-shell";
import { MarketDetailClient } from "@/components/markets/market-detail-client";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function MarketDetailPage({ params }: PageProps) {
  const { id } = await params;

  return (
    <PageShell
      title="Market Detail"
      description="Market probability, volume, wallet flow, and recent trade analytics."
    >
      <MarketDetailClient marketId={id} />
    </PageShell>
  );
}
