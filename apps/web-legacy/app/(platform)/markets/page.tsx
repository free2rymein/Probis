import { PageShell } from "@/components/layout/page-shell";
import { MarketsClient } from "@/components/markets/markets-client";

export default function MarketsPage() {
  return (
    <PageShell
      title="Markets"
      description="Prediction market coverage, liquidity, probability movement, and venue context."
    >
      <MarketsClient />
    </PageShell>
  );
}
