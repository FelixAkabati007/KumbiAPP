"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { LogoDisplay } from "@/components/logo-display";
import { Button } from "@/components/ui/button";

export function WorkspaceHeader({
  title,
  eyebrow = "Workspace",
  children,
}: {
  title: string;
  eyebrow?: string;
  children?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-orange-200 bg-background/90 px-3 py-3 backdrop-blur dark:border-orange-700 sm:px-4">
      <div className="flex min-w-0 items-center gap-3">
        <Link href="/" aria-label="Back to dashboard">
          <Button variant="outline" size="icon">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          </Button>
        </Link>
        <Link href="/" className="flex min-w-0 items-center gap-3 hover:opacity-80" aria-label="Open dashboard">
          <LogoDisplay size="sm" />
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold uppercase tracking-[0.14em] text-orange-700 dark:text-orange-300">{eyebrow}</p>
            <h1 className="truncate text-lg font-bold">{title}</h1>
          </div>
        </Link>
      </div>
      {children ? <div className="flex items-center gap-2">{children}</div> : null}
    </header>
  );
}
