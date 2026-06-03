import { PageShell } from "@/components/layout/page-shell";
import { SignalsClient } from "@/components/signals/signals-client";
import type { SignalsQuery } from "@/lib/api/hooks";

type SignalsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const firstParam = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

const confidenceParam = (value: string | undefined): SignalsQuery["confidence"] =>
  value === "low" || value === "medium" || value === "high" || value === "critical"
    ? value
    : undefined;

const lifecycleParam = (value: string | undefined): SignalsQuery["lifecycle"] =>
  value === "emerging" || value === "active" || value === "fading" || value === "resolved"
    ? value
    : undefined;

const sortParam = (value: string | undefined): SignalsQuery["sort"] =>
  value === "priority" || value === "severity_score" || value === "detected_at"
    ? value
    : "priority";

export default async function SignalsPage({ searchParams }: SignalsPageProps) {
  const params = await searchParams;
  const initialQuery: Partial<SignalsQuery> = {
    anomalyType: firstParam(params.anomalyType),
    confidence: confidenceParam(firstParam(params.confidence)),
    lifecycle: lifecycleParam(firstParam(params.lifecycle)),
    marketId: firstParam(params.marketId),
    sort: sortParam(firstParam(params.sort))
  };

  return (
    <PageShell
      title="Signals"
      description="Ranked anomalies, correlation signals, and confidence-scored intelligence events."
    >
      <SignalsClient initialQuery={initialQuery} />
    </PageShell>
  );
}
