"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Command, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { rolePermissions, type AppSection, type UserRole } from "@/lib/roles";

const destinations: Array<{ section: AppSection; label: string; description: string; href: string }> = [
  { section: "pos", label: "POS Terminal", description: "Create orders and manage checkout", href: "/pos" },
  { section: "kitchen", label: "Kitchen Display", description: "View active kitchen tickets", href: "/kitchen" },
  { section: "orderBoard", label: "Order Board", description: "Track order progress", href: "/order-display" },
  { section: "menu", label: "Menu Management", description: "Manage menu items and pricing", href: "/menu" },
  { section: "inventory", label: "Inventory", description: "Review stock and availability", href: "/inventory" },
  { section: "reports", label: "Reports", description: "Review operational reports", href: "/reports" },
  { section: "finance", label: "Finance", description: "Review finance workflows", href: "/finance" },
  { section: "payments", label: "Payments", description: "Manage payment records", href: "/payments" },
  { section: "rooms", label: "Rooms", description: "Manage hotel rooms", href: "/hotels/rooms" },
  { section: "reservations", label: "Reservations", description: "Manage guest reservations", href: "/hotels/reservations" },
  { section: "housekeeping", label: "Housekeeping", description: "Coordinate housekeeping tasks", href: "/hotels/housekeeping" },
  { section: "maintenance", label: "Maintenance", description: "Resolve maintenance issues", href: "/maintenance" },
  { section: "operations", label: "Operations", description: "Coordinate operational work", href: "/operations" },
  { section: "events", label: "Event Organization", description: "Plan and coordinate events", href: "/events" },
  { section: "system", label: "System Controls", description: "Manage application settings", href: "/system" },
];

export function GlobalSearch({ role }: { role?: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const userRole = role as UserRole;
  const permitted = useMemo(() => destinations.filter((item) => rolePermissions[userRole]?.[item.section]), [userRole]);
  const results = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return permitted;
    return permitted.filter((item) => `${item.label} ${item.description}`.toLowerCase().includes(normalized));
  }, [permitted, query]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  function navigate(href: string) {
    setOpen(false);
    setQuery("");
    router.push(href);
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { setOpen(nextOpen); if (!nextOpen) setQuery(""); }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-10 gap-2 rounded-2xl border-orange-200 bg-background/90 px-3 text-orange-700 shadow-sm hover:bg-orange-50 dark:border-orange-700 dark:text-orange-300 dark:hover:bg-orange-900/20" aria-label="Open global search">
          <Search className="h-4 w-4" aria-hidden="true" />
          <span className="hidden sm:inline">Search</span>
          <kbd className="hidden rounded border border-orange-200 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground sm:inline dark:border-orange-700">⌘K</kbd>
        </Button>
      </DialogTrigger>
      <DialogContent className="top-[18%] max-w-xl translate-y-0 overflow-hidden rounded-3xl border-orange-200 p-0 dark:border-orange-800">
        <DialogHeader className="border-b border-orange-100 bg-orange-50/70 px-5 py-4 dark:border-orange-900 dark:bg-orange-950/40">
          <DialogTitle className="flex items-center gap-2 text-lg"><Command className="h-4 w-4 text-orange-600" />Global search</DialogTitle>
          <DialogDescription>Find a permitted workspace or feature.</DialogDescription>
        </DialogHeader>
        <div className="p-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <Input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search workspaces..." className="h-11 rounded-2xl pl-9" aria-label="Search workspaces" />
          </div>
          <div className="mt-3 max-h-72 overflow-y-auto" role="listbox" aria-label="Search results">
            {results.length ? results.map((item) => <button key={item.section} type="button" className="flex w-full items-center justify-between rounded-2xl px-3 py-3 text-left transition hover:bg-orange-50 focus-visible:bg-orange-50 focus-visible:outline-none dark:hover:bg-orange-950/40 dark:focus-visible:bg-orange-950/40" onClick={() => navigate(item.href)}><span><span className="block font-medium">{item.label}</span><span className="block text-sm text-muted-foreground">{item.description}</span></span><ArrowRight className="h-4 w-4 text-orange-600" aria-hidden="true" /></button>) : <p className="px-3 py-8 text-center text-sm text-muted-foreground">No permitted workspaces match your search.</p>}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
