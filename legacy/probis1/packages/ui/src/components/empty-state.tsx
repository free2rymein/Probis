import type { ReactNode } from "react";
import { cn } from "../lib/styles";

export function EmptyState({
  title,
  description,
  action,
  className
}: {
  title: string;
  description: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "border-border bg-card/40 flex min-h-48 flex-col items-center justify-center rounded-lg border border-dashed p-6 text-center",
        className
      )}
    >
      <h3 className="text-foreground text-sm font-semibold">{title}</h3>
      <p className="text-muted-foreground mt-2 max-w-md text-sm">{description}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
