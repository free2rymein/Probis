"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@probis/shared";
import { Badge } from "@probis/ui";
import { navItems, systemItems } from "./nav-items";

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="border-border bg-card/80 fixed inset-y-0 left-0 z-40 hidden w-64 border-r backdrop-blur lg:block">
      <div className="border-border flex h-14 items-center border-b px-4">
        <div>
          <div className="text-foreground text-sm font-semibold uppercase tracking-[0.18em]">
            Probis
          </div>
          <div className="text-muted-foreground text-[11px]">Institutional Intelligence</div>
        </div>
      </div>
      <nav className="space-y-1 p-3">
        {navItems.map((item) => {
          const active = pathname === item.href;
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "text-muted-foreground hover:bg-accent hover:text-foreground flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                active && "bg-accent text-foreground"
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-border absolute bottom-0 left-0 right-0 border-t p-4">
        {systemItems.map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.label} className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground flex items-center gap-2 text-xs">
                <Icon className="h-3.5 w-3.5" />
                {item.label}
              </span>
              <Badge variant="outline">{item.value}</Badge>
            </div>
          );
        })}
      </div>
    </aside>
  );
}
