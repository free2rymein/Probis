"use client";

import { useMemo, useState } from "react";
import { AlertCircle, ArrowDown, ArrowUp, RefreshCw } from "lucide-react";
import type { AnomalySignal, Severity } from "@probis/types";
import {
  Badge,
  Button,
  EmptyState,
  SeverityIndicator,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@probis/ui";
import { formatCompactNumber } from "@probis/shared";
import { useSignals, type SignalsQuery } from "@/lib/api/hooks";

const severityFromScore = (score: number): Severity => {
  if (score >= 90) return "critical";
  if (score >= 75) return "high";
  if (score >= 50) return "medium";
  if (score >= 25) return "low";
  return "neutral";
};

const formatType = (type: string) => type.replaceAll("_", " ");

const metadataPreview = (metadata: Record<string, unknown>) => {
  const entries = Object.entries(metadata).slice(0, 3);
  if (entries.length === 0) return "none";

  return entries
    .map(([key, value]) => {
      const displayValue =
        typeof value === "number" ? Number(value.toFixed(4)).toString() : String(value);
      return `${key}: ${displayValue}`;
    })
    .join(" | ");
};

function SignalRow({ signal }: { signal: AnomalySignal }) {
  return (
    <TableRow>
      <TableCell className="min-w-52">
        <div className="flex items-center gap-2">
          <SeverityIndicator severity={severityFromScore(signal.severityScore)} />
          <Badge variant="outline">{formatType(signal.anomalyType)}</Badge>
        </div>
      </TableCell>
      <TableCell className="min-w-80">
        <div className="text-foreground font-medium">{signal.marketTitle}</div>
        <div className="text-muted-foreground mt-1 line-clamp-2 text-xs">{signal.summary}</div>
      </TableCell>
      <TableCell className="font-mono">{signal.severityScore.toFixed(0)}</TableCell>
      <TableCell className="font-mono">{signal.confidenceScore.toFixed(0)}</TableCell>
      <TableCell className="text-muted-foreground max-w-96 truncate font-mono text-xs">
        {metadataPreview(signal.metadata)}
      </TableCell>
      <TableCell className="text-muted-foreground whitespace-nowrap font-mono text-xs">
        {new Date(signal.detectedAt).toLocaleString()}
      </TableCell>
    </TableRow>
  );
}

export function SignalsClient() {
  const [sort, setSort] = useState<SignalsQuery["sort"]>("severity_score");
  const [direction, setDirection] = useState<"asc" | "desc">("desc");
  const [minSeverity, setMinSeverity] = useState("");
  const [offset, setOffset] = useState(0);
  const limit = 25;

  const query = useMemo<SignalsQuery>(
    () => ({
      limit,
      offset,
      sort,
      direction,
      minSeverity: minSeverity ? Number(minSeverity) : undefined
    }),
    [direction, minSeverity, offset, sort]
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
          <option value="severity_score">Severity</option>
          <option value="detected_at">Detected time</option>
        </select>
        <select
          value={minSeverity}
          onChange={(event) => {
            setMinSeverity(event.target.value);
            setOffset(0);
          }}
          className="border-border bg-background focus:ring-ring h-9 rounded-md border px-3 text-sm outline-none focus:ring-2"
        >
          <option value="">All severities</option>
          <option value="50">50+</option>
          <option value="75">75+</option>
          <option value="90">90+</option>
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
          <Skeleton className="h-72" />
        </div>
      ) : signals.data?.items.length ? (
        <div className="border-border bg-background overflow-hidden rounded-lg border">
          <Table>
            <TableHeader className="border-border sticky top-0 z-30 border-b bg-[#090d14] [&_th]:bg-[#090d14]">
              <TableRow className="hover:bg-transparent">
                <TableHead className="bg-[#090d14]">Signal</TableHead>
                <TableHead className="bg-[#090d14]">Market</TableHead>
                <TableHead className="bg-[#090d14]">Severity</TableHead>
                <TableHead className="bg-[#090d14]">Confidence</TableHead>
                <TableHead className="bg-[#090d14]">Metadata</TableHead>
                <TableHead className="bg-[#090d14]">Detected</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {signals.data.items.map((signal) => (
                <SignalRow key={signal.id} signal={signal} />
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <EmptyState
          title="No signals emitted"
          description="The intelligence engine is intentionally quiet until aggregate history crosses configured thresholds."
        />
      )}

      <div className="text-muted-foreground flex flex-col gap-2 text-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          {signals.isFetching ? (
            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <AlertCircle className="h-3.5 w-3.5" />
          )}
          {formatCompactNumber(total)} signals indexed
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
