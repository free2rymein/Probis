"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AlertCircle, ArrowDown, ArrowUp, RefreshCw, SignalHigh } from "lucide-react";
import type { AnomalySignal, Severity } from "@probis/types";
import {
  Badge,
  Button,
  Card,
  CardContent,
  EmptyState,
  SeverityIndicator,
  Skeleton
} from "@probis/ui";
import { formatCompactNumber } from "@probis/shared";
import { useSignals, type SignalsQuery } from "@/lib/api/hooks";
import { shortWalletAddress, walletAlias } from "@/lib/wallet-display";

const severityFromScore = (score: number): Severity => {
  if (score >= 90) return "critical";
  if (score >= 75) return "high";
  if (score >= 50) return "medium";
  if (score >= 25) return "low";
  return "neutral";
};

const formatType = (type: string | null | undefined) =>
  (type ?? "signal").replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

const confidenceVariant = (confidence: AnomalySignal["qualityConfidence"]) => {
  if (confidence === "critical") return "danger";
  if (confidence === "high") return "success";
  if (confidence === "medium") return "warning";
  return "outline";
};

const lifecycleVariant = (lifecycle: AnomalySignal["lifecycle"]) => {
  if (lifecycle === "active") return "success";
  if (lifecycle === "emerging") return "warning";
  if (lifecycle === "fading") return "outline";
  return "default";
};

const narrativeVariant = (strength: AnomalySignal["narrativeStrength"]) => {
  if (strength === "dominant") return "danger";
  if (strength === "active") return "success";
  if (strength === "emerging") return "warning";
  return "outline";
};

const ageLabel = (timestamp: string) => {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(timestamp).getTime()) / 60_000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
};

function SignalCard({ signal }: { signal: AnomalySignal }) {
  const composite = signal.compositeType ?? signal.anomalyType;
  const priority = signal.priorityScore ?? signal.severityScore;
  const confidence = signal.qualityConfidence ?? "low";
  const lifecycle = signal.lifecycle ?? "active";
  const wallets = signal.walletAddresses.slice(0, 3);

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <SeverityIndicator severity={severityFromScore(priority)} />
              <Badge variant={confidenceVariant(confidence)}>{confidence} confidence</Badge>
              <Badge variant={lifecycleVariant(lifecycle)}>{lifecycle}</Badge>
              {signal.narrativeTheme ? (
                <Badge variant={narrativeVariant(signal.narrativeStrength)}>
                  {formatType(signal.narrativeTheme)}
                </Badge>
              ) : null}
              {signal.clusterTag ? <Badge variant="outline">{signal.clusterTag}</Badge> : null}
              <Badge variant="outline">{formatType(composite)}</Badge>
              {(signal.relatedSignalCount ?? 0) > 1 ? (
                <Badge variant="outline">{signal.relatedSignalCount} grouped</Badge>
              ) : null}
            </div>
            <Link
              href={`/markets/${signal.marketId}`}
              className="text-foreground line-clamp-2 text-sm font-semibold hover:underline"
            >
              {signal.marketTitle}
            </Link>
            <p className="text-muted-foreground max-w-4xl text-sm leading-6">
              {signal.explanation ?? signal.summary}
            </p>
            {signal.relatedMarketContext ? (
              <p className="text-muted-foreground max-w-4xl text-xs leading-5">
                {signal.relatedMarketContext}
              </p>
            ) : null}
            {signal.affectedMarkets?.length ? (
              <div className="mt-2 flex flex-wrap gap-2">
                {signal.affectedMarkets.map((market) => (
                  <Link
                    key={market.marketId}
                    href={`/markets/${market.marketId}`}
                    className="text-muted-foreground hover:text-foreground rounded border px-2 py-1 text-xs hover:underline"
                    title={market.relationship}
                  >
                    {market.title}
                  </Link>
                ))}
              </div>
            ) : null}
          </div>
          <div className="grid min-w-40 grid-cols-2 gap-2 text-right text-xs lg:block lg:space-y-2">
            <div>
              <div className="text-muted-foreground">Priority</div>
              <div className="text-foreground font-mono text-lg">{priority.toFixed(0)}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Detected</div>
              <div className="text-foreground font-mono">{ageLabel(signal.detectedAt)}</div>
            </div>
          </div>
        </div>

        <div className="grid gap-3 lg:grid-cols-[1fr_18rem]">
          <div className="space-y-2">
            <div className="text-muted-foreground text-xs uppercase tracking-wide">
              Why it matters
            </div>
            <div className="flex flex-wrap gap-2">
              {(signal.contributors?.length ? signal.contributors : ["single anomaly event"]).map(
                (contributor) => (
                  <Badge key={contributor} variant="default" className="normal-case">
                    {contributor}
                  </Badge>
                )
              )}
            </div>
          </div>
          <div className="space-y-2">
            <div className="text-muted-foreground text-xs uppercase tracking-wide">
              Wallets involved
            </div>
            {wallets.length ? (
              <div className="space-y-1">
                {wallets.map((wallet) => (
                  <Link
                    key={wallet}
                    href={`/wallets/${wallet}`}
                    title={wallet}
                    className="text-muted-foreground hover:text-foreground block truncate text-xs hover:underline"
                  >
                    {walletAlias(wallet, null)}
                    <span className="ml-2 font-mono">{shortWalletAddress(wallet)}</span>
                  </Link>
                ))}
                {signal.walletAddresses.length > wallets.length ? (
                  <div className="text-muted-foreground text-xs">
                    +{signal.walletAddresses.length - wallets.length} more
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="text-muted-foreground text-xs">Market-level signal</div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

type SignalsClientProps = {
  initialQuery?: Partial<SignalsQuery>;
};

export function SignalsClient({ initialQuery }: SignalsClientProps) {
  const [sort, setSort] = useState<SignalsQuery["sort"]>(initialQuery?.sort ?? "priority");
  const [direction, setDirection] = useState<"asc" | "desc">("desc");
  const [minSeverity, setMinSeverity] = useState("");
  const [confidence, setConfidence] = useState<SignalsQuery["confidence"] | "">(
    initialQuery?.confidence ?? ""
  );
  const [lifecycle, setLifecycle] = useState<SignalsQuery["lifecycle"] | "">(
    initialQuery?.lifecycle ?? ""
  );
  const [offset, setOffset] = useState(0);
  const limit = 25;

  const query = useMemo<SignalsQuery>(
    () => ({
      limit,
      offset,
      sort,
      direction,
      confidence: confidence || undefined,
      lifecycle: lifecycle || undefined,
      anomalyType: initialQuery?.anomalyType,
      marketId: initialQuery?.marketId,
      minSeverity: minSeverity ? Number(minSeverity) : undefined
    }),
    [
      confidence,
      direction,
      initialQuery?.anomalyType,
      initialQuery?.marketId,
      lifecycle,
      minSeverity,
      offset,
      sort
    ]
  );

  const signals = useSignals(query);
  const total = signals.data?.pagination.total ?? 0;
  const canGoBack = offset > 0;
  const canGoForward = Boolean(signals.data?.pagination.nextOffset);

  return (
    <div className="space-y-3">
      <div className="border-border bg-card flex flex-col gap-2 rounded-lg border p-3 lg:flex-row lg:items-center">
        <select
          value={sort}
          onChange={(event) => {
            setSort(event.target.value as SignalsQuery["sort"]);
            setOffset(0);
          }}
          className="border-border bg-background focus:ring-ring h-9 rounded-md border px-3 text-sm outline-none focus:ring-2"
        >
          <option value="priority">Priority</option>
          <option value="severity_score">Raw severity</option>
          <option value="detected_at">Detected time</option>
        </select>
        <select
          value={confidence}
          onChange={(event) => {
            setConfidence(event.target.value as SignalsQuery["confidence"] | "");
            setOffset(0);
          }}
          className="border-border bg-background focus:ring-ring h-9 rounded-md border px-3 text-sm outline-none focus:ring-2"
        >
          <option value="">All confidence</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <select
          value={lifecycle}
          onChange={(event) => {
            setLifecycle(event.target.value as SignalsQuery["lifecycle"] | "");
            setOffset(0);
          }}
          className="border-border bg-background focus:ring-ring h-9 rounded-md border px-3 text-sm outline-none focus:ring-2"
        >
          <option value="">All lifecycle</option>
          <option value="active">Active</option>
          <option value="emerging">Emerging</option>
          <option value="fading">Fading</option>
          <option value="resolved">Resolved</option>
        </select>
        <select
          value={minSeverity}
          onChange={(event) => {
            setMinSeverity(event.target.value);
            setOffset(0);
          }}
          className="border-border bg-background focus:ring-ring h-9 rounded-md border px-3 text-sm outline-none focus:ring-2"
        >
          <option value="">All curated signals</option>
          <option value="50">Severity 50+</option>
          <option value="75">Severity 75+</option>
          <option value="90">Severity 90+</option>
        </select>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setDirection(direction === "asc" ? "desc" : "asc");
            setOffset(0);
          }}
        >
          {direction === "asc" ? (
            <ArrowUp className="h-4 w-4" />
          ) : (
            <ArrowDown className="h-4 w-4" />
          )}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => void signals.refetch()}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {signals.isError ? (
        <EmptyState
          title="Signals unavailable"
          description="The API could not load anomaly events. Retry after confirming workers and database connectivity."
          action={
            <Button variant="outline" onClick={() => void signals.refetch()}>
              Retry
            </Button>
          }
        />
      ) : signals.isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-12" />
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
        </div>
      ) : signals.data?.items.length ? (
        <div className="space-y-3">
          <div className="border-border bg-background/60 flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
            <SignalHigh className="text-primary h-4 w-4" />
            <span className="text-muted-foreground">
              Showing deduplicated, confidence-ranked signals. Weak repeated noise is suppressed.
            </span>
          </div>
          {signals.data.items.map((signal) => (
            <SignalCard key={signal.id} signal={signal} />
          ))}
        </div>
      ) : (
        <EmptyState
          title="No curated signals"
          description="The quality layer is suppressing weak or repetitive anomalies until stronger market evidence appears."
        />
      )}

      <div className="text-muted-foreground flex flex-col gap-2 text-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          {signals.isFetching ? (
            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <AlertCircle className="h-3.5 w-3.5" />
          )}
          {formatCompactNumber(total)} curated signals
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={!canGoBack}
            onClick={() => setOffset(Math.max(0, offset - limit))}
          >
            Previous
          </Button>
          <span className="font-mono text-xs">
            {total === 0 ? 0 : offset + 1}-{Math.min(offset + limit, total)}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={!canGoForward}
            onClick={() => setOffset(offset + limit)}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
