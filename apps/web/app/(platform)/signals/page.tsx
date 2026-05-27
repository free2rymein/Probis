import { EmptyState, SeverityIndicator } from "@probis/ui";
import { PageShell } from "@/components/layout/page-shell";

export default function SignalsPage() {
  return (
    <PageShell
      title="Signals"
      description="Ranked anomalies, correlation signals, and confidence-scored intelligence events."
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {(["neutral", "low", "medium", "high", "critical"] as const).map((severity) => (
          <div key={severity} className="border-border bg-card rounded-lg border p-3">
            <SeverityIndicator severity={severity} />
            <p className="mt-3 text-2xl font-semibold">0</p>
          </div>
        ))}
      </div>
      <EmptyState
        title="No signals emitted"
        description="Scoring workers will publish typed signals here once anomaly pipelines are attached."
      />
    </PageShell>
  );
}
