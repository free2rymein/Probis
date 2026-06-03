import { Bell } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, EmptyState } from "@probis/ui";
import { PageShell } from "@/components/layout/page-shell";

export default function AlertsPage() {
  return (
    <PageShell
      title="Alerts"
      description="Institutional alert routing, escalation, severity policies, and delivery history."
    >
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-4 w-4" />
            Alert Policies
          </CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState
            title="No alert policies configured"
            description="Create policies after signal thresholds, destinations, and user roles are finalized."
          />
        </CardContent>
      </Card>
    </PageShell>
  );
}
