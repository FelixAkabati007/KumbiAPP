"use client";

import Link from "next/link";
import { ArrowLeft, ChefHat, ExternalLink, ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function SplitWorkspacePage() {
  return (
    <main className="flex min-h-screen flex-col bg-gradient-to-br from-orange-50 via-amber-50 to-yellow-100 text-foreground dark:from-orange-950 dark:via-amber-950 dark:to-yellow-950">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-orange-200 bg-background/90 px-4 py-3 backdrop-blur dark:border-orange-700">
        <div className="flex items-center gap-3">
          <Link href="/">
            <Button variant="outline" size="icon" aria-label="Back to dashboard">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-orange-700 dark:text-orange-300">Single-screen workspace</p>
            <h1 className="text-lg font-bold">POS + Kitchen Display</h1>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">Optimized for one desktop without a secondary display</p>
      </header>

      <section className="grid flex-1 gap-4 p-4 lg:grid-cols-2">
        <WorkspacePanel title="Sales" description="POS Terminal" icon={<ShoppingCart className="h-5 w-5" />} href="/pos" />
        <WorkspacePanel title="Orders" description="Kitchen Display" icon={<ChefHat className="h-5 w-5" />} href="/kitchen" />
      </section>
    </main>
  );
}

function WorkspacePanel({ title, description, icon, href }: { title: string; description: string; icon: React.ReactNode; href: string }) {
  return (
    <section className="flex min-h-[38rem] flex-col overflow-hidden rounded-3xl border border-orange-200 bg-background/80 shadow-lg backdrop-blur dark:border-orange-700">
      <div className="flex items-center justify-between border-b border-orange-200 px-4 py-3 dark:border-orange-700">
        <div className="flex items-center gap-3">
          <div className="rounded-2xl bg-orange-100 p-2 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300">{icon}</div>
          <div>
            <h2 className="font-bold">{title}</h2>
            <p className="text-sm text-muted-foreground">{description}</p>
          </div>
        </div>
        <Link href={href} target="_blank" rel="noreferrer">
          <Button variant="outline" size="sm" className="gap-2">
            <ExternalLink className="h-4 w-4" />
            Open
          </Button>
        </Link>
      </div>
      <iframe title={description} src={href} className="min-h-0 flex-1 border-0" />
    </section>
  );
}
