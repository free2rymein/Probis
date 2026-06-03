"use client";

import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { MarketHistoryPoint } from "@probis/types";
import { formatCompactCurrency, formatProbability } from "@/lib/format";

type Metric = "probability" | "volume" | "openInterest";

const timestamp = (value: string) => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric" }).format(new Date(value));

export function MarketHistoryChart({ history, metric }: { history: MarketHistoryPoint[]; metric: Metric }) {
  const usable = history.filter((point) => point[metric] !== null);
  if (usable.length < 2) return <div className="flex h-[340px] items-center justify-center rounded-md border border-dashed border-border bg-muted/30 px-6 text-center text-sm text-muted-foreground">Historical data will appear after the snapshot worker collects enough samples.</div>;

  const formatter = metric === "probability" ? (value: number) => formatProbability(value) : (value: number) => formatCompactCurrency(value);
  const data = usable.map((point) => ({ ...point, label: timestamp(point.snapshotTime) }));

  return (
    <div className="h-[340px] w-full sm:h-[410px]">
      <ResponsiveContainer width="100%" height="100%">
        {metric === "volume" ? (
          <BarChart data={data} margin={{ top: 12, right: 6, bottom: 0, left: 4 }}>
            <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" minTickGap={28} />
            <YAxis tickFormatter={(value) => formatter(Number(value))} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" width={58} />
            <Tooltip formatter={(value) => formatter(Number(value))} labelStyle={{ color: "#111827" }} />
            <Bar dataKey="volume" fill="#2563eb" radius={[3, 3, 0, 0]} />
          </BarChart>
        ) : (
          <AreaChart data={data} margin={{ top: 12, right: 6, bottom: 0, left: 4 }}>
            <defs><linearGradient id={`fill-${metric}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={metric === "probability" ? "#0f766e" : "#7c3aed"} stopOpacity={0.24} /><stop offset="100%" stopColor={metric === "probability" ? "#0f766e" : "#7c3aed"} stopOpacity={0} /></linearGradient></defs>
            <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" minTickGap={28} />
            <YAxis domain={metric === "probability" ? [0, 1] : ["auto", "auto"]} tickFormatter={(value) => formatter(Number(value))} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" width={58} />
            <Tooltip formatter={(value) => formatter(Number(value))} labelStyle={{ color: "#111827" }} />
            <Area type="monotone" dataKey={metric} stroke={metric === "probability" ? "#0f766e" : "#7c3aed"} strokeWidth={2.5} fill={`url(#fill-${metric})`} />
          </AreaChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}
