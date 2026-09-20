"use client";

import Link from "next/link";
import { ArrowLeft, ExternalLink, Menu, Package } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { Button } from "@/components/ui/button";
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
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-orange-200 bg-background/90 px-4 py-3 backdrop-blur dark:border-orange-700">
        <div className="flex items-center gap-3"><Link href="/"><Button variant="outline" size="icon" aria-label="Back to dashboard"><ArrowLeft className="h-4 w-4" /></Button></Link><div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-orange-700 dark:text-orange-300">Single-screen workspace</p><h1 className="text-lg font-bold">Menu Management + Inventory</h1></div></div>
        <p className="text-sm text-muted-foreground">Only roles with both permissions can access this workspace</p>
      </header>
      <section className="grid flex-1 gap-4 p-4 lg:grid-cols-2">
        <WorkspacePanel title="Menu Management" description="Create and manage menu items" icon={<Menu className="h-5 w-5" />} href="/menu" />
        <WorkspacePanel title="Inventory" description="Track stock and inventory items" icon={<Package className="h-5 w-5" />} href="/inventory" />
      </section>
    </main>
  );
}

function WorkspacePanel({ title, description, icon, href }: { title: string; description: string; icon: React.ReactNode; href: string }) {
  return <section className="flex min-h-[38rem] flex-col overflow-hidden rounded-3xl border border-orange-200 bg-background/80 shadow-lg backdrop-blur dark:border-orange-700"><div className="flex items-center justify-between border-b border-orange-200 px-4 py-3 dark:border-orange-700"><div className="flex items-center gap-3"><div className="rounded-2xl bg-orange-100 p-2 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300">{icon}</div><div><h2 className="font-bold">{title}</h2><p className="text-sm text-muted-foreground">{description}</p></div></div><Link href={href} target="_blank" rel="noreferrer"><Button variant="outline" size="sm" className="gap-2"><ExternalLink className="h-4 w-4" />Open</Button></Link></div><iframe title={description} src={href} className="min-h-0 flex-1 border-0" /></section>;
}
