import {
  Activity,
  Bell,
  Gauge,
  History,
  Landmark,
  Settings,
  Signal,
  WalletCards
} from "lucide-react";

export const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: Gauge },
  { href: "/markets", label: "Markets", icon: Landmark },
  { href: "/signals", label: "Signals", icon: Signal },
  { href: "/wallets", label: "Wallets", icon: WalletCards },
  { href: "/replay", label: "Replay", icon: History },
  { href: "/alerts", label: "Alerts", icon: Bell },
  { href: "/settings", label: "Settings", icon: Settings }
] as const;

export const systemItems = [{ label: "Realtime bus", value: "Prepared", icon: Activity }] as const;
