import { Activity, AlertTriangle, Landmark, WalletCards } from "lucide-react";
import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  SeverityIndicator
} from "@probis/ui";
import { formatCompactNumber, formatPercent, formatUsd } from "@probis/shared";
import { PageShell } from "@/components/layout/page-shell";

const metrics = [
  { label: "Tracked markets", value: "0", icon: Landmark },
  { label: "Wallet entities", value: "0", icon: WalletCards },
  { label: "Open signals", value: "0", icon: Activity },
  { label: "Critical alerts", value: "0", icon: AlertTriangle }
] as const;

export default function DashboardPage() {
  return (
    <PageShell
      title="Dashboard"
      description="Command surface for market dislocations, wallet behavior, and institutional signal flow."
    >
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => {
          const Icon = metric.icon;
          return (
            <Card key={metric.label}>
              <CardContent className="flex items-center justify-between">
                <div>
                  <p className="text-muted-foreground text-xs uppercase">{metric.label}</p>
                  <p className="mt-2 text-2xl font-semibold">{metric.value}</p>
                </div>
                <Icon className="text-muted-foreground h-5 w-5" />
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Market Intelligence Stream</CardTitle>
          </CardHeader>
          <CardContent>
            <EmptyState
              title="No live market stream connected"
              description="Connect ingestion workers and Supabase tables when production data sources are approved."
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>System Readiness</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">API route handlers</span>
              <Badge variant="success">ready</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Realtime bus</span>
              <SeverityIndicator severity="neutral" />
            </div>
            <div className="grid grid-cols-3 gap-2 pt-2 font-mono text-xs">
              <span>{formatUsd(0)}</span>
              <span>{formatCompactNumber(0)}</span>
              <span>{formatPercent(0)}</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </PageShell>
  );
}
