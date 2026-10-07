"use client";

import Link from "next/link";
import { ExternalLink, Menu, Package } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { Button } from "@/components/ui/button";
import { WorkspaceHeader } from "@/components/workspace-header";
import { rolePermissions, type UserRole } from "@/lib/roles";

export default function MenuInventorySplitWorkspacePage() {
  const { user } = useAuth();
  const access = user ? rolePermissions[user.role as UserRole] : undefined;
  const allowed = Boolean(access?.menu && access?.inventory);

  if (!allowed) {
    return <main className="flex min-h-screen items-center justify-center p-6"><section className="max-w-md space-y-4 text-center"><h1 className="text-xl font-bold">Access restricted</h1><p className="text-muted-foreground">Your role is not permitted to use the Menu Management and Inventory workspace.</p><Link href="/"><Button>Return to dashboard</Button></Link></section></main>;
}


  return (
    <main className="flex min-h-screen flex-col bg-gradient-to-br from-orange-50 via-amber-50 to-yellow-100 text-foreground dark:from-orange-950 dark:via-amber-950 dark:to-yellow-950">
      <WorkspaceHeader title="Menu Management + Inventory" eyebrow="Single-screen workspace">
        <p className="text-sm text-muted-foreground">Only roles with both permissions can access this workspace</p>
      </WorkspaceHeader>
      <section className="grid min-h-0 flex-1 gap-3 p-3 sm:gap-4 sm:p-4 lg:grid-cols-2">
        <WorkspacePanel title="Menu Management" description="Create and manage menu items" icon={<Menu className="h-5 w-5" />} href="/menu" />
        <WorkspacePanel title="Inventory" description="Track stock and inventory items" icon={<Package className="h-5 w-5" />} href="/inventory" />
      </section>
    </main>
  );
}

function WorkspacePanel({ title, description, icon, href }: { title: string; description: string; icon: React.ReactNode; href: string }) {
  return <section className="flex min-h-[32rem] min-w-0 flex-col overflow-hidden rounded-2xl border border-orange-200 bg-background/80 shadow-lg backdrop-blur sm:min-h-[38rem] sm:rounded-3xl dark:border-orange-700"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-orange-200 px-3 py-3 sm:px-4 dark:border-orange-700"><div className="flex min-w-0 items-center gap-3"><div className="shrink-0 rounded-2xl bg-orange-100 p-2 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300">{icon}</div><div className="min-w-0"><h2 className="truncate font-bold">{title}</h2><p className="truncate text-sm text-muted-foreground">{description}</p></div></div><Link href={href} target="_blank" rel="noreferrer" className="ml-auto"><Button variant="outline" size="sm" className="gap-2"><ExternalLink className="h-4 w-4" />Open</Button></Link></div><iframe title={description} loading="lazy" src={href} className="min-h-0 flex-1 border-0" /></section>;
}
