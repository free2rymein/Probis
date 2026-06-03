"use client";

import Link from "next/link";
import { X } from "lucide-react";
import { Button } from "@probis/ui";
import { useUiStore } from "@/lib/ui-store";
import { navItems } from "./nav-items";

export function MobileSidebar() {
  const open = useUiStore((state) => state.sidebarOpen);
  const setOpen = useUiStore((state) => state.setSidebarOpen);

  if (!open) return null;

  return (
    <div className="bg-background/80 fixed inset-0 z-50 backdrop-blur lg:hidden">
      <aside className="border-border bg-card h-full w-72 border-r p-3">
        <div className="mb-3 flex items-center justify-between px-2">
          <span className="text-sm font-semibold uppercase tracking-[0.18em]">Probis</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setOpen(false)}
            aria-label="Close sidebar"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        <nav className="space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className="text-muted-foreground hover:bg-accent hover:text-foreground flex items-center gap-3 rounded-md px-3 py-2 text-sm"
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>
    </div>
  );
}
