"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, RefreshCw } from "lucide-react";
import type { WalletIntelligenceSummary } from "@probis/types";
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
import { formatCompactNumber, formatUsd } from "@probis/shared";
import { useWallets, type WalletsQuery } from "@/lib/api/hooks";

const shortAddress = (address: string) => `${address.slice(0, 6)}...${address.slice(-4)}`;

function WalletRow({ wallet }: { wallet: WalletIntelligenceSummary }) {
  return (
    <TableRow>
      <TableCell className="min-w-56">
        <Link
          href={`/wallets/${wallet.walletAddress}`}
          className="font-mono font-medium hover:underline"
        >
          {shortAddress(wallet.walletAddress)}
        </Link>
      </TableCell>
      <TableCell className="font-mono">{wallet.smartMoneyScore.toFixed(0)}</TableCell>
      <TableCell className="font-mono">{wallet.convictionScore.toFixed(0)}</TableCell>
      <TableCell className="font-mono">{wallet.influenceScore.toFixed(0)}</TableCell>
      <TableCell className="font-mono">{formatUsd(wallet.totalVolumeUsd)}</TableCell>
      <TableCell className="font-mono">{formatCompactNumber(wallet.activeMarketCount)}</TableCell>
      <TableCell>
        <Badge variant={wallet.anomalyTriggerCount > 0 ? "warning" : "outline"}>
          {wallet.anomalyTriggerCount}
        </Badge>
      </TableCell>
      <TableCell className="text-muted-foreground whitespace-nowrap font-mono text-xs">
        {new Date(wallet.lastActiveAt).toLocaleString()}
      </TableCell>
    </TableRow>
  );
}

export function WalletsClient() {
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<WalletsQuery["sort"]>("smart_money_score");
  const [direction, setDirection] = useState<"asc" | "desc">("desc");
  const [offset, setOffset] = useState(0);
  const limit = 25;

  const query = useMemo<WalletsQuery>(
    () => ({ limit, offset, search, sort, direction }),
    [direction, offset, search, sort]
  );
  const wallets = useWallets(query);
  const total = wallets.data?.pagination.total ?? 0;

  return (
    <div className="space-y-3">
      <div className="border-border bg-card flex flex-col gap-2 rounded-lg border p-3 lg:flex-row lg:items-center">
        <input
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setOffset(0);
          }}
          placeholder="Search wallet address"
          className="border-border bg-background focus:ring-ring h-9 min-w-0 flex-1 rounded-md border px-3 font-mono text-sm outline-none focus:ring-2"
        />
        <select
          value={sort}
          onChange={(event) => {
            setSort(event.target.value as WalletsQuery["sort"]);
            setOffset(0);
          }}
          className="border-border bg-background focus:ring-ring h-9 rounded-md border px-3 text-sm outline-none focus:ring-2"
        >
          <option value="smart_money_score">Smart money</option>
          <option value="influence_score">Influence</option>
          <option value="total_volume_usd">Volume</option>
          <option value="last_active_at">Recent activity</option>
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
        <Button variant="ghost" size="sm" onClick={() => void wallets.refetch()}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {wallets.isError ? (
        <EmptyState
          title="Wallet intelligence unavailable"
          description="The API could not load wallet profiles. Check worker health and database connectivity."
        />
      ) : wallets.isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-12" />
          <Skeleton className="h-72" />
        </div>
      ) : wallets.data?.items.length ? (
        <div className="border-border bg-background overflow-hidden rounded-lg border">
          <Table>
            <TableHeader className="border-border sticky top-0 z-30 border-b bg-[#090d14] [&_th]:bg-[#090d14]">
              <TableRow className="hover:bg-transparent">
                <TableHead>Wallet</TableHead>
                <TableHead>Smart</TableHead>
                <TableHead>Conviction</TableHead>
                <TableHead>Influence</TableHead>
                <TableHead>Total Volume</TableHead>
                <TableHead>Markets</TableHead>
                <TableHead>Anomalies</TableHead>
                <TableHead>Last Active</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {wallets.data.items.map((wallet) => (
                <WalletRow key={wallet.walletAddress} wallet={wallet} />
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <EmptyState
          title="No wallet profiles yet"
          description="Profiles appear after the wallet intelligence profiler processes recent trade partitions."
        />
      )}

      <div className="text-muted-foreground flex flex-col gap-2 text-sm sm:flex-row sm:items-center sm:justify-between">
        <span>{formatCompactNumber(total)} wallets profiled</span>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={offset === 0}
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
            disabled={!wallets.data?.pagination.nextOffset}
            onClick={() => setOffset(offset + limit)}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
