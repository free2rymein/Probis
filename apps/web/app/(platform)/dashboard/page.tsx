import { DashboardClient } from "@/components/dashboard/dashboard-client";
import { PageShell } from "@/components/layout/page-shell";

export default function DashboardPage() {
  return (
    <PageShell
      title="Dashboard"
      description="Command surface for market dislocations, wallet behavior, and institutional signal flow."
    >
      <DashboardClient />
    </PageShell>
  );
}
