import { Card, CardContent, CardHeader, CardTitle, EmptyState } from "@probis/ui";
import { PageShell } from "@/components/layout/page-shell";

export default function ReplayPage() {
  return (
    <PageShell
      title="Replay"
      description="Historical market and wallet state reconstruction for research and incident review."
    >
      <Card>
        <CardHeader>
          <CardTitle>Replay Timeline</CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState
            title="No replay sessions available"
            description="Replay jobs will be backed by immutable timeline events and worker-managed snapshots."
          />
        </CardContent>
      </Card>
    </PageShell>
  );
}
