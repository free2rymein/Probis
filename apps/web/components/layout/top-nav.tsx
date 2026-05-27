"use client";

import { Menu, Search } from "lucide-react";
import { Button } from "@probis/ui";
import { useUiStore } from "@/lib/ui-store";

export function TopNav() {
  const toggleSidebar = useUiStore((state) => state.toggleSidebar);

  return (
    <header className="border-border bg-background/85 sticky top-0 z-30 border-b backdrop-blur">
      <div className="flex h-14 items-center gap-3 px-4 sm:px-6 lg:px-8">
        <Button
          variant="ghost"
          size="sm"
          className="lg:hidden"
          onClick={toggleSidebar}
          aria-label="Open sidebar"
        >
          <Menu className="h-4 w-4" />
        </Button>
        <div className="border-border bg-card text-muted-foreground flex min-w-0 flex-1 items-center gap-2 rounded-md border px-3 py-2 text-sm">
          <Search className="h-4 w-4 shrink-0" />
          <span className="truncate">Search markets, wallets, signals</span>
        </div>
        <div className="text-muted-foreground hidden items-center gap-2 text-xs sm:flex">
          <span className="h-2 w-2 rounded-full bg-emerald-400" />
          API standby
        </div>
      </div>
    </header>
  );
}
