import { PageShell } from "@/components/layout/page-shell";
import { WalletDetailClient } from "@/components/wallets/wallet-detail-client";

export default async function WalletDetailPage({
  params
}: {
  params: Promise<{ address: string }>;
}) {
  const { address } = await params;

  return (
    <PageShell
      title="Wallet Profile"
      description="Behavioral scoring, recent market exposure, and anomaly-linked activity."
    >
      <WalletDetailClient address={address} />
    </PageShell>
  );
}
