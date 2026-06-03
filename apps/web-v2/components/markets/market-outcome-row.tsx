import type { MarketOutcome } from "@probis/types";
import { formatProbability } from "@/lib/format";

export function MarketOutcomeRow({ outcome, compact = false }: { outcome: MarketOutcome; compact?: boolean }) {
  const probability = outcome.probability ?? 0;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="truncate font-medium">{outcome.outcomeName}</span>
        <span className="font-semibold tabular-nums">{formatProbability(outcome.probability)}</span>
      </div>
      <div className={compact ? "h-1 rounded-full bg-muted" : "h-1.5 rounded-full bg-muted"}>
        <div className="h-full rounded-full bg-yes transition-[width]" style={{ width: `${Math.max(0, Math.min(1, probability)) * 100}%` }} />
      </div>
    </div>
  );
}
