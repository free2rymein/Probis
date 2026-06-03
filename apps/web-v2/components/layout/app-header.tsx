import Link from "next/link";
import { Search } from "lucide-react";
import { ThemeToggle } from "./theme-toggle";

export function AppHeader({ compact = false }: { compact?: boolean }) {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-[1480px] items-center gap-4 px-4 sm:px-6">
        <Link href="/" className="text-lg font-bold tracking-normal text-foreground">Probis</Link>
        {!compact && (
          <Link href="/markets" className="hidden text-sm font-medium text-muted-foreground transition hover:text-foreground sm:block">Markets</Link>
        )}
        <div className="ml-auto flex items-center gap-2">
          <Link href="/markets" aria-label="Search markets" title="Search markets" className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-border bg-card text-muted-foreground transition hover:bg-secondary hover:text-foreground">
            <Search size={17} />
          </Link>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
