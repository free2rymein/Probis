import { Skeleton } from "@/components/ui/skeleton";

export function MarketCardSkeleton() {
  return <div className="min-h-[310px] rounded-md border border-border bg-card p-4"><Skeleton className="h-5 w-24" /><Skeleton className="mt-5 h-5 w-full" /><Skeleton className="mt-2 h-5 w-4/5" /><Skeleton className="mt-8 h-4 w-full" /><Skeleton className="mt-4 h-4 w-full" /><div className="mt-10 grid grid-cols-3 gap-2"><Skeleton className="h-10" /><Skeleton className="h-10" /><Skeleton className="h-10" /></div></div>;
}
