import { PageShell } from "@/components/layout/page-shell";
import { SignalsClient } from "@/components/signals/signals-client";

export default function SignalsPage() {
  return (
    <PageShell
      title="Signals"
      description="Ranked anomalies, correlation signals, and confidence-scored intelligence events."
    >
      <SignalsClient />
    </PageShell>
  );
}
