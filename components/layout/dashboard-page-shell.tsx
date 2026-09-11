"use client";

import Link from "next/link";
import { ArrowLeft, LayoutDashboard } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

interface DashboardPageShellProps {
  children: ReactNode;
  eyebrow?: string;
  title: string;
  description?: string;
  backHref?: string;
  backLabel?: string;
  actions?: ReactNode;
}

export function DashboardPageShell({ children, eyebrow, title, description, backHref = "/", backLabel = "Back to Dashboard", actions }: DashboardPageShellProps) {
  return (
    <main className="min-h-screen bg-gradient-to-br from-orange-50 via-amber-50 to-yellow-100 p-3 pt-5 dark:from-orange-950 dark:via-amber-950 dark:to-yellow-950 sm:p-4 md:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex items-center justify-between gap-3">
          <Link href={backHref} className="inline-flex items-center gap-2 text-sm font-medium text-orange-700 transition-colors hover:text-orange-900 dark:text-orange-300 dark:hover:text-orange-100">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            {backLabel}
          </Link>
          <Button asChild variant="outline" size="sm" className="rounded-2xl border-orange-200 bg-white/70 text-orange-700 hover:bg-orange-100 dark:border-orange-700 dark:bg-gray-800/70 dark:text-orange-300">
            <Link href="/"><LayoutDashboard className="mr-2 h-4 w-4" />Dashboard</Link>
          </Button>
        </div>
        <header className="flex flex-col gap-4 border-b border-orange-200 pb-6 dark:border-orange-700 md:flex-row md:items-end md:justify-between">
          <div>
            {eyebrow && <p className="text-sm font-medium text-orange-600 dark:text-orange-400">{eyebrow}</p>}
            <h1 className="text-3xl font-bold tracking-tight text-gray-800 dark:text-gray-200 md:text-4xl">{title}</h1>
            {description && <p className="mt-2 max-w-3xl text-muted-foreground">{description}</p>}
          </div>
          {actions && <div className="flex w-full flex-wrap items-center gap-2 md:w-auto md:justify-end">{actions}</div>}
        </header>
        {children}
      </div>
    </main>
  );
}
