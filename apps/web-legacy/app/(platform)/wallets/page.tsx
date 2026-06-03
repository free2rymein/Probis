import { PageShell } from "@/components/layout/page-shell";
import { WalletsClient } from "@/components/wallets/wallets-client";

export default function WalletsPage() {
  return (
    <PageShell
      title="Wallet Intelligence"
      description="Smart money ranking, conviction scoring, market influence, and behavioral fingerprints."
    >
      <WalletsClient />
    </PageShell>
  );
}
