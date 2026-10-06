"use client";

import { CheckCircle2, ClipboardList, FileText, IndianRupee } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { WorkspaceSummary } from "@/components/events/event-workspace-panels";

const tone: Record<WorkspaceSummary["booking"]["status"], string> = {
  complete: "border-emerald-300 bg-emerald-50/70 dark:border-emerald-900 dark:bg-emerald-950/30",
  action_required: "border-amber-300 bg-amber-50/70 dark:border-amber-900 dark:bg-amber-950/30",
  awaiting_payment: "border-sky-300 bg-sky-50/70 dark:border-sky-900 dark:bg-sky-950/30",
  neutral: "border-border bg-background",
  exception: "border-destructive/40 bg-destructive/5",
  in_progress: "border-primary/30 bg-primary/5",
};

export function EventOperationalSummary({ summary, onOpen }: { summary?: WorkspaceSummary; onOpen: (tab: "overview" | "quote" | "payments" | "finance" | "operations" | "documents" | "activity") => void }) {
  if (!summary) return null;
  const cards = [
    { key: "booking", label: "Booking", icon: CheckCircle2, detail: summary.booking.detail, action: summary.booking.action, tab: summary.booking.secured ? "overview" as const : "quote" as const },
    { key: "collections", label: "Collections", icon: IndianRupee, detail: summary.collections.detail, action: summary.collections.action, tab: "payments" as const },
    { key: "delivery", label: "Delivery", icon: ClipboardList, detail: summary.delivery.detail, action: summary.delivery.action, tab: "operations" as const },
    { key: "records", label: "Records", icon: FileText, detail: summary.records.detail, action: summary.records.action, tab: "documents" as const },
  ];
  return <section className="rounded-2xl border border-primary/30 bg-primary/5 p-4" aria-label="Event operational summary">
    <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-sm font-semibold">Live operational view</p><p className="text-xs text-muted-foreground">Booking, collections, delivery, and records reflect the latest event data.</p></div><Badge variant="outline">Updated {new Date(summary.refreshedAt).toLocaleTimeString()}</Badge></div>
    <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{cards.map(({ key, label, icon: Icon, detail, action, tab }) => { const item = summary[key as keyof WorkspaceSummary] as WorkspaceSummary["booking"]; return <button type="button" key={key} onClick={() => onOpen(tab)} className={`min-h-28 rounded-xl border p-4 text-left transition-colors hover:bg-background ${tone[item.status]}`}><div className="flex items-center justify-between gap-2"><span className="flex items-center gap-2 text-sm font-semibold"><Icon className="size-4" />{label}</span><Badge variant="secondary">{item.status.replace("_", " ")}</Badge></div><p className="mt-3 text-sm">{detail}</p>{action && <p className="mt-1 text-xs font-medium text-primary">{action}</p>}</button>; })}</div>
  </section>;
}
