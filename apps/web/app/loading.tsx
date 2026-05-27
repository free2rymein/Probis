import { Skeleton } from "@probis/ui";

export default function Loading() {
  return (
    <main className="p-6">
      <Skeleton className="h-8 w-48" />
      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
      </div>
    </main>
  );
}
