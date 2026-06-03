import type { HTMLAttributes } from "react";
import { cn } from "../lib/styles";

type BadgeVariant = "default" | "outline" | "success" | "warning" | "danger";

const variants: Record<BadgeVariant, string> = {
  default: "border-border bg-secondary text-secondary-foreground",
  outline: "border-border bg-transparent text-muted-foreground",
  success: "border-emerald-900/60 bg-emerald-950/40 text-emerald-300",
  warning: "border-amber-900/60 bg-amber-950/40 text-amber-300",
  danger: "border-red-900/60 bg-red-950/40 text-red-300"
};

export type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  variant?: BadgeVariant;
};

export function Badge({ className, variant = "default", ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide",
        variants[variant],
        className
      )}
      {...props}
    />
  );
}
