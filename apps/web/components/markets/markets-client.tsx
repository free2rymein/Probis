"use client";

import { useMemo, useState } from "react";
import { AlertCircle, ArrowDown, ArrowUp, RefreshCw } from "lucide-react";
import type { MarketListItem } from "@probis/types";
import {
  Badge,
  Button,
  EmptyState,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@probis/ui";
import { formatCompactNumber, formatPercent } from "@probis/shared";
import { useMarkets, type MarketsQuery } from "@/lib/api/hooks";

const statusVariant = {
  draft: "outline",
  open: "success",
  paused: "warning",
  closed: "outline",
  settled: "outline",
  cancelled: "danger"
} as const;

const sortLabels = {
  updated_at: "Updated",
  volume: "Volume",
  probability: "Probability",
  title: "Title",
  status: "Status"
} as const;

function MarketRow({ market }: { market: MarketListItem }) {
  return (
    <TableRow>
      <TableCell className="min-w-72">
        <div className="text-foreground font-medium">{market.title}</div>
        <div className="text-muted-foreground mt-1 text-xs">{market.category}</div>
      </TableCell>
      <TableCell>
        <Badge variant="outline">{market.source}</Badge>
      </TableCell>
      <TableCell className="font-mono">
        {market.probability === null ? "n/a" : formatPercent(market.probability)}
      </TableCell>
      <TableCell className="font-mono">{formatCompactNumber(market.volume24h)}</TableCell>
      <TableCell className="font-mono">
        {market.liquidity === null ? "n/a" : formatCompactNumber(market.liquidity)}
      </TableCell>
      <TableCell>
        <Badge variant={statusVariant[market.status]}>{market.status}</Badge>
      </TableCell>
      <TableCell className="text-muted-foreground whitespace-nowrap font-mono text-xs">
        {new Date(market.updatedAt).toLocaleString()}
      </TableCell>
    </TableRow>
  );
}

export function MarketsClient() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [sort, setSort] = useState<MarketsQuery["sort"]>("updated_at");
  const [direction, setDirection] = useState<"asc" | "desc">("desc");
  const [offset, setOffset] = useState(0);
  const limit = 25;

  const query = useMemo<MarketsQuery>(
    () => ({
      limit,
      offset,
      search,
      status,
      sort,
      direction
    }),
    [direction, offset, search, sort, status]
  );

  const markets = useMarkets(query);
  const total = markets.data?.pagination.total ?? 0;
  const canGoBack = offset > 0;
  const canGoForward = Boolean(markets.data?.pagination.nextOffset);

  const resetOffset = () => setOffset(0);

  return (
    <div className="space-y-3">
      <div className="border-border bg-card flex flex-col gap-2 rounded-lg border p-3 lg:flex-row lg:items-center">
        <input
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            resetOffset();
          }}
          placeholder="Search markets"
          className="border-border bg-background focus:ring-ring h-9 min-w-0 flex-1 rounded-md border px-3 text-sm outline-none focus:ring-2"
        />
        <select
          value={status}
          onChange={(event) => {
            setStatus(event.target.value);
            resetOffset();
          }}
          className="border-border bg-background focus:ring-ring h-9 rounded-md border px-3 text-sm outline-none focus:ring-2"
        >
          <option value="">All statuses</option>
          <option value="open">Open</option>
          <option value="paused">Paused</option>
          <option value="closed">Closed</option>
          <option value="settled">Settled</option>
        </select>
        <select
          value={sort}
          onChange={(event) => {
            setSort(event.target.value as MarketsQuery["sort"]);
            resetOffset();
          }}
          className="border-border bg-background focus:ring-ring h-9 rounded-md border px-3 text-sm outline-none focus:ring-2"
        >
          {Object.entries(sortLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setDirection(direction === "asc" ? "desc" : "asc");
            resetOffset();
          }}
        >
          {direction === "asc" ? (
            <ArrowUp className="h-4 w-4" />
          ) : (
            <ArrowDown className="h-4 w-4" />
          )}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => void markets.refetch()}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {markets.isError ? (
        <EmptyState
          title="Markets unavailable"
          description="The API could not load market data. Retry after confirming the database and API are reachable."
          action={
            <Button variant="outline" onClick={() => void markets.refetch()}>
              Retry
            </Button>
          }
        />
      ) : markets.isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-12" />
          <Skeleton className="h-72" />
        </div>
      ) : markets.data?.items.length ? (
        <div className="border-border overflow-hidden rounded-lg border">
          <Table>
            <TableHeader className="bg-card sticky top-14 z-10">
              <TableRow>
                <TableHead>Market</TableHead>
                <TableHead>Venue</TableHead>
                <TableHead>Probability</TableHead>
                <TableHead>Volume 24h</TableHead>
                <TableHead>Liquidity</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Updated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {markets.data.items.map((market) => (
                <MarketRow key={market.id} market={market} />
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <EmptyState
          title="No markets match this view"
          description="Try clearing search or filters. Newly discovered markets appear after ingestion syncs metadata."
        />
      )}

      <div className="text-muted-foreground flex flex-col gap-2 text-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          {markets.isFetching ? (
            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <AlertCircle className="h-3.5 w-3.5" />
          )}
          {formatCompactNumber(total)} markets indexed
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
            {offset + 1}-{Math.min(offset + limit, total)}
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
