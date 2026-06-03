import type { Severity } from "@probis/types";
import { cn } from "../lib/styles";

const severityStyles: Record<Severity, string> = {
  neutral: "bg-severity-neutral text-severity-neutral-foreground",
  low: "bg-severity-low text-severity-low-foreground",
  medium: "bg-severity-medium text-severity-medium-foreground",
  high: "bg-severity-high text-severity-high-foreground",
  critical: "bg-severity-critical text-severity-critical-foreground"
};

export function SeverityIndicator({
  severity,
  className
}: {
  severity: Severity;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase",
        severityStyles[severity],
        className
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {severity}
    </span>
  );
}
