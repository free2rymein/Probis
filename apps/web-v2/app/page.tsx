import Link from "next/link";
import { ArrowRight, BarChart3, CheckCircle2, Clock3 } from "lucide-react";
import { AppHeader } from "@/components/layout/app-header";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-background">
      <AppHeader compact />
      <section className="relative overflow-hidden border-b border-border bg-card">
        <div className="mx-auto grid min-h-[410px] max-w-[1240px] items-center gap-8 px-4 py-16 sm:px-6 lg:grid-cols-[1fr_420px]">
          <div>
            <p className="text-xs font-bold uppercase text-yes">Probis 2.0</p>
            <h1 className="mt-4 max-w-2xl text-4xl font-bold leading-tight sm:text-5xl">Prediction Markets Explorer</h1>
            <p className="mt-5 max-w-xl text-base leading-7 text-muted-foreground">Explore real-time prediction markets across venues.</p>
            <Link href="/markets?venue=polymarket" className="mt-8 inline-flex h-11 items-center gap-2 rounded-md bg-primary px-5 text-sm font-semibold text-primary-foreground transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              Explore Polymarket <ArrowRight size={16} />
            </Link>
          </div>
          <div className="grid gap-3" aria-label="Venue selection">
            <Link href="/markets?venue=polymarket" className="group rounded-md border border-border bg-background p-5 transition hover:-translate-y-0.5 hover:border-slate-400 hover:shadow-lg hover:shadow-slate-900/5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2"><BarChart3 size={18} className="text-yes" /><h2 className="font-bold">Polymarket</h2></div>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">Browse active prediction markets and outcome probabilities.</p>
                </div>
                <CheckCircle2 size={18} className="text-yes" />
              </div>
              <p className="mt-5 text-xs font-semibold text-yes">Available now</p>
            </Link>
            <div className="rounded-md border border-border bg-muted/60 p-5 text-muted-foreground" aria-disabled="true">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2"><BarChart3 size={18} /><h2 className="font-bold text-foreground/70">Kalshi</h2></div>
                  <p className="mt-2 text-sm leading-6">A regulated event-market venue reserved for a future release.</p>
                </div>
                <Clock3 size={18} />
              </div>
              <p className="mt-5 text-xs font-semibold">Coming soon</p>
            </div>
          </div>
        </div>
      </section>
      <section className="mx-auto max-w-[1240px] px-4 py-10 sm:px-6">
        <div className="grid gap-6 border-y border-border py-6 sm:grid-cols-3">
          <Value title="Browse clearly" detail="Scan markets, outcomes, and activity without dashboard noise." />
          <Value title="Compare quickly" detail="Move between categories and venues with a research-first layout." />
          <Value title="Inspect deeply" detail="Open a market workspace for outcomes and historical context." />
        </div>
      </section>
    </main>
  );
}

function Value({ title, detail }: { title: string; detail: string }) {
  return <div><h2 className="text-sm font-bold">{title}</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">{detail}</p></div>;
}
