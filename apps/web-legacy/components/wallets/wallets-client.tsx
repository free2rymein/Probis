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
import { archetypeLabel, shortWalletAddress, walletAliasFromSummary } from "@/lib/wallet-display";

const metadataNumber = (wallet: WalletIntelligenceSummary, key: string) => {
  const value = wallet.metadata[key];
  const parsed =
    typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
};

const metadataString = (wallet: WalletIntelligenceSummary, key: string) => {
  const value = wallet.metadata[key];
  return typeof value === "string" ? value : null;
};

const formatPercent = (value: number | null) => {
  if (value === null || !Number.isFinite(value)) return "n/a";
  return new Intl.NumberFormat("en-US", {
    style: "percent",
    maximumFractionDigits: 0
  }).format(value);
};

const specializationTags = (wallet: WalletIntelligenceSummary) => {
  const value = wallet.metadata.specialization_tags;
  return Array.isArray(value) ? value.map(String).filter(Boolean).slice(0, 3) : [];
};

function WalletRow({ wallet }: { wallet: WalletIntelligenceSummary }) {
  const alias = walletAliasFromSummary(wallet);
  const archetype =
    typeof wallet.metadata.archetype === "string" ? wallet.metadata.archetype : null;
  const reliability = metadataNumber(wallet, "reliability_score");
  const timing = metadataString(wallet, "entry_timing_label") ?? "n/a";
  const timingConfidence = metadataString(wallet, "entry_timing_confidence") ?? "low";
  const proxyPnl = metadataNumber(wallet, "proxy_pnl_usd");
  const proxyWinRate = metadataNumber(wallet, "proxy_win_rate");
  const tags = specializationTags(wallet);

  return (
    <TableRow>
      <TableCell className="min-w-56">
        <Link
          href={`/wallets/${wallet.walletAddress}`}
          title={wallet.walletAddress}
          className="font-medium hover:underline"
        >
          {alias}
        </Link>
        <div className="text-muted-foreground mt-1 font-mono text-xs">
          {shortWalletAddress(wallet.walletAddress)}
        </div>
      </TableCell>
      <TableCell>
        <Badge variant="outline">{archetypeLabel(archetype)}</Badge>
      </TableCell>
      <TableCell>
        <div className="font-mono">{reliability === null ? "n/a" : reliability.toFixed(0)}</div>
        <div className="text-muted-foreground text-xs">
          {metadataString(wallet, "reliability_confidence") ?? "low"}
        </div>
      </TableCell>
      <TableCell className="font-mono">{wallet.convictionScore.toFixed(0)}</TableCell>
      <TableCell>
        <div className="capitalize">{timing}</div>
        <div className="text-muted-foreground text-xs">{timingConfidence}</div>
      </TableCell>
      <TableCell>
        <div className={`font-mono ${(proxyPnl ?? 0) >= 0 ? "text-emerald-300" : "text-red-300"}`}>
          {proxyPnl === null ? "n/a" : formatUsd(proxyPnl)}
        </div>
        <div className="text-muted-foreground text-xs">win {formatPercent(proxyWinRate)}</div>
      </TableCell>
      <TableCell>
        <div className="flex flex-wrap gap-1">
          {tags.length ? (
            tags.map((tag) => (
              <Badge key={tag} variant="outline">
                {tag.replace("_", "/")}
              </Badge>
            ))
          ) : (
            <span className="text-muted-foreground text-xs">n/a</span>
          )}
        </div>
      </TableCell>
      <TableCell>
        <Link
          href={`/wallets/${wallet.walletAddress}?section=anomalies`}
          title="Open anomaly drilldown"
          className="inline-flex"
        >
          <Badge
            variant={wallet.anomalyTriggerCount > 0 ? "warning" : "outline"}
            className={wallet.anomalyTriggerCount > 0 ? "hover:bg-amber-900/60" : ""}
          >
            {wallet.anomalyTriggerCount}
          </Badge>
        </Link>
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
                <TableHead>Archetype</TableHead>
                <TableHead>Reliability</TableHead>
                <TableHead>Conviction</TableHead>
                <TableHead>Timing</TableHead>
                <TableHead>Proxy PnL</TableHead>
                <TableHead>Specialization</TableHead>
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
