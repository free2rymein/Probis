import { Sidebar } from "@/components/layout/sidebar";
import { MobileSidebar } from "@/components/layout/mobile-sidebar";
import { TopNav } from "@/components/layout/top-nav";

export default function PlatformLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="bg-background text-foreground min-h-screen">
      <Sidebar />
      <MobileSidebar />
      <div className="min-h-screen lg:pl-64">
        <TopNav />
        <main className="mx-auto w-full max-w-7xl px-4 py-4 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
