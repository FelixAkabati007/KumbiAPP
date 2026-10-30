"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/auth-provider";
import { hasPermission } from "@/lib/roles";
import {
  ArrowLeft,
  Banknote,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  FileText,
  Printer,
  RefreshCw,
  Users,
  Wallet,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LogoDisplay } from "@/components/logo-display";
import {
  EventActivity,
  EventDocuments,
  EventFinance,
  EventOperations,
  EventPayments,
  type WorkspaceData,
} from "@/components/events/event-workspace-panels";
import { EventBookingPanel } from "@/components/events/event-booking-panel";
import { EventPricingDesk } from "@/components/events/event-pricing-desk";

type EventRecord = {
  id: string;
  name: string;
  client_name: string;
  venue: string;
  starts_at: string;
  ends_at?: string | null;
  guest_count: number;
  status: string;
  notes?: string | null;
  payment_status?: string;
  receipt_id?: string | null;
  quote_approved?: boolean;
  finance_posted?: boolean;
};

type Tab =
  | "overview"
  | "quote"
  | "payments"
  | "finance"
  | "operations"
  | "documents"
  | "activity";

const labels: Record<string, string> = {
  planning: "Planning",
  confirmed: "Confirmed",
  in_progress: "In progress",
  completed: "Completed",
  cancelled: "Cancelled",
};

const tabs: { id: Tab; label: string; icon: typeof CalendarDays }[] = [
  { id: "overview", label: "Overview", icon: CalendarDays },
  { id: "quote", label: "Quote & Booking", icon: FileText },
  { id: "payments", label: "Payments", icon: Wallet },
  { id: "finance", label: "Finance", icon: Banknote },
  { id: "operations", label: "Banquet Tasks", icon: ClipboardList },
  { id: "documents", label: "Documents", icon: FileText },
  { id: "activity", label: "Activity Log", icon: CheckCircle2 },
];

export function EventDetailWorkspace({
  eventId,
  autoPrint = false,
}: {
  eventId: string;
  autoPrint?: boolean;
}) {
  const { user } = useAuth();
  const canPrice = Boolean(user?.role && hasPermission(user.role, "eventPricing"));
  const [event, setEvent] = useState<EventRecord | null>(null);
  const [tab, setTab] = useState<Tab>("quote");
  const [selectedQuoteId, setSelectedQuoteId] = useState<string | null>(null);
  const [quoteRefreshKey, setQuoteRefreshKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [workspaceError, setWorkspaceError] = useState("");
  const [workspaceData, setWorkspaceData] = useState<WorkspaceData>({
    receipts: [],
    payments: [],
    ledger: [],
    activity: [],
    tasks: [],
    paymentsSummary: {
      invoiceTotal: 0,
      paidTotal: 0,
      balanceDue: 0,
      status: "not_invoiced",
      transactionCount: 0,
      successfulTransactionCount: 0,
      pendingTransactionCount: 0,
      failedTransactionCount: 0,
      receiptId: null,
      lastPaymentAt: null,
      reconciliation: "not_applicable",
      exception: null,
    },
    finance: {
      invoiceTotal: 0,
      subtotal: null,
      tax: null,
      paidTotal: 0,
      balanceDue: 0,
      ledgerPostedTotal: 0,
      transactionCount: 0,
      receiptId: null,
      status: "not_invoiced",
      reconciliation: "not_applicable",
      lastUpdatedAt: null,
      exception: null,
    },
    booking: {
      status: "neutral",
      detail: "Loading booking status",
      action: null,
      quoteStatus: "pending",
      secured: false,
    },
    collections: {
      status: "neutral",
      detail: "Loading collection status",
      action: null,
      invoiced: 0,
      paid: 0,
      balanceDue: 0,
      transactionCount: 0,
    },
    delivery: {
      status: "neutral",
      detail: "Loading delivery status",
      action: null,
      openTasks: 0,
      completedTasks: 0,
    },
    records: {
      status: "neutral",
      detail: "Loading records",
      action: null,
      documentsAvailable: 0,
      activityCount: 0,
      lastActivityAt: null,
    },
    refreshedAt: new Date().toISOString(),
  });

  useEffect(() => {
    const requestedTab = new URLSearchParams(window.location.search).get("tab");
    fetch("/api/events", { cache: "no-store" })
      .then((response) => response.json())
      .then((data) => {
        const found =
          (data.events ?? []).find((item: EventRecord) => item.id === eventId) ??
          null;
        setEvent(found);
        if (requestedTab && tabs.some((item) => item.id === requestedTab)) {
          setTab(requestedTab as Tab);
        } else if (found) {
          if (!found.quote_approved || !found.receipt_id) setTab("quote");
          else if (found.payment_status !== "paid") setTab("payments");
          else setTab("overview");
        }
      })
      .finally(() => setLoading(false));
  }, [eventId]);

  function openTab(nextTab: Tab) {
    setTab(nextTab);
    window.history.replaceState(null, "", `/events/${eventId}?tab=${nextTab}`);
  }

  useEffect(() => {
    if (event && autoPrint) window.setTimeout(() => window.print(), 250);
  }, [event, autoPrint]);

  const refreshWorkspace = useCallback(async () => {
    setRefreshing(true);
    try {
      const [eventsResponse, workspaceResponse] = await Promise.all([
        fetch("/api/events", { cache: "no-store" }),
        fetch(`/api/events/${eventId}/workspace`, { cache: "no-store" }),
      ]);
      if (eventsResponse.ok) {
        const data = (await eventsResponse.json()) as { events?: EventRecord[] };
        setEvent(
          (data.events ?? []).find((item) => item.id === eventId) ?? null,
        );
      }
      if (workspaceResponse.ok) {
        setWorkspaceData(await workspaceResponse.json());
        setWorkspaceError("");
      } else {
        setWorkspaceError("Could not refresh workspace data.");
      }
      setQuoteRefreshKey((k) => k + 1);
    } catch {
      setWorkspaceError("Could not refresh workspace data.");
    } finally {
      setRefreshing(false);
    }
  }, [eventId]);

  useEffect(() => {
    let active = true;
    const loadWorkspace = () =>
      fetch(`/api/events/${eventId}/workspace`, { cache: "no-store" })
        .then((response) => response.json())
        .then((data) => {
          if (active) setWorkspaceData(data);
        })
        .catch(() => undefined);
    void loadWorkspace();
    const timer = window.setInterval(() => {
      void loadWorkspace();
      void fetch("/api/events", { cache: "no-store" })
        .then((response) => response.json())
        .then((data) =>
          setEvent(
            (data.events ?? []).find((item: EventRecord) => item.id === eventId) ??
              null,
          ),
        );
    }, 15000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [eventId]);

  const eventDate = useMemo(
    () =>
      event
        ? `${new Date(event.starts_at).toLocaleString()}${
            event.ends_at ? ` – ${new Date(event.ends_at).toLocaleString()}` : ""
          }`
        : "",
    [event],
  );

  if (loading)
    return (
      <main className="min-h-screen bg-gradient-to-br from-orange-50 via-amber-50 to-yellow-100 p-6 dark:from-orange-950 dark:via-amber-950 dark:to-yellow-950">
        <p className="mx-auto max-w-6xl text-sm text-muted-foreground">
          Loading event workspace…
        </p>
      </main>
    );
  if (!event)
    return (
      <main className="min-h-screen bg-gradient-to-br from-orange-50 via-amber-50 to-yellow-100 p-6 dark:from-orange-950 dark:via-amber-950 dark:to-yellow-950">
        <div className="mx-auto max-w-6xl space-y-4">
          <p className="text-sm text-destructive">Event not found.</p>
          <Button asChild variant="outline">
            <Link href="/events">
              <ArrowLeft data-icon="inline-start" />
              Back to events
            </Link>
          </Button>
        </div>
      </main>
    );

  const pipelineSteps: Array<{
    step: string;
    title: string;
    detail: string;
    done: boolean;
    targetTab: Tab;
  }> = [
    {
      step: "Step 1",
      title: "Quote & Pricing",
      detail: event.quote_approved ? "Quote approved" : "Build & approve quote",
      done: Boolean(event.quote_approved),
      targetTab: "quote",
    },
    {
      step: "Step 2",
      title: "Secure Venue & Invoice",
      detail: event.receipt_id
        ? `Secured · GHS ${workspaceData.paymentsSummary.invoiceTotal.toFixed(2)}`
        : "Confirm booking",
      done: Boolean(event.receipt_id),
      targetTab: "quote",
    },
    {
      step: "Step 3",
      title: "Deposit & Payments",
      detail:
        workspaceData.paymentsSummary.status === "paid"
          ? "Paid in full"
          : workspaceData.paymentsSummary.paidTotal > 0
            ? `GHS ${workspaceData.paymentsSummary.paidTotal.toFixed(2)} paid · GHS ${workspaceData.paymentsSummary.balanceDue.toFixed(2)} due`
            : "Record deposit",
      done: workspaceData.paymentsSummary.paidTotal > 0,
      targetTab: "payments",
    },
    {
      step: "Step 4",
      title: "Banquet Delivery & Docs",
      detail:
        workspaceData.delivery.openTasks > 0
          ? `${workspaceData.delivery.openTasks} open task(s)`
          : workspaceData.tasks.length > 0
            ? "All tasks complete"
            : "Assign setup tasks",
      done:
        workspaceData.tasks.length > 0 && workspaceData.delivery.openTasks === 0,
      targetTab: "operations",
    },
  ];

  return (
    <main className="flex min-h-screen flex-col bg-gradient-to-br from-orange-50 via-amber-50 to-yellow-100 text-foreground dark:from-orange-950 dark:via-amber-950 dark:to-yellow-950">
      <header className="sticky top-0 z-30 flex min-h-14 flex-wrap items-center justify-between gap-3 border-b border-orange-200 bg-white/90 px-3 py-2 backdrop-blur-md dark:border-orange-700 dark:bg-gray-900/90 sm:min-h-16 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <Button
            asChild
            variant="outline"
            size="icon"
            className="shrink-0 rounded-full border-orange-200 hover:bg-orange-100 dark:border-orange-700 dark:hover:bg-orange-900/30"
          >
            <Link href="/events" aria-label="Back to events">
              <ArrowLeft className="h-4 w-4 text-orange-600 dark:text-orange-400" />
            </Link>
          </Button>
          <LogoDisplay size="sm" />
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-orange-700 dark:text-orange-300">
              Event Workspace · {event.client_name}
            </p>
            <h1 className="truncate text-lg font-bold tracking-tight sm:text-xl">
              {event.name}
            </h1>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{labels[event.status] ?? event.status}</Badge>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void refreshWorkspace()}
            disabled={refreshing}
            aria-label="Refresh event workspace"
          >
            <RefreshCw
              data-icon="inline-start"
              className={refreshing ? "animate-spin" : undefined}
            />
            {refreshing ? "Refreshing" : "Refresh"}
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href={`/events/${event.id}?print=receipt`}>
              <Printer data-icon="inline-start" />
              Print
            </Link>
          </Button>
        </div>
      </header>

      <div className="mx-auto w-full max-w-6xl flex-1 space-y-5 p-4 md:p-8">
        {/* Compact Summary Strip */}
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="bg-white/80 dark:bg-gray-900/70">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Schedule &amp; Venue</p>
              <p className="mt-1 truncate text-sm font-semibold">{event.venue}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{eventDate}</p>
            </CardContent>
          </Card>
          <Card className="bg-white/80 dark:bg-gray-900/70">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Client &amp; Guests</p>
              <p className="mt-1 truncate text-sm font-semibold">
                {event.client_name}
              </p>
              <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                <Users className="size-3.5 text-primary" />
                {event.guest_count} guests
              </p>
            </CardContent>
          </Card>
          <Card className="bg-white/80 dark:bg-gray-900/70">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Financial Status</p>
              <p className="mt-1 text-sm font-semibold">
                GHS {workspaceData.paymentsSummary.paidTotal.toFixed(2)} / GHS{" "}
                {workspaceData.paymentsSummary.invoiceTotal.toFixed(2)}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Balance due: GHS{" "}
                {workspaceData.paymentsSummary.balanceDue.toFixed(2)}
              </p>
            </CardContent>
          </Card>
          <Card className="bg-white/80 dark:bg-gray-900/70">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Booking Status</p>
              <p className="mt-1 text-sm font-semibold">
                {event.receipt_id ? "Venue Secured" : "Awaiting Confirmation"}
              </p>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                {workspaceData.receipts[0]?.snapshot?.bookingAccount?.name ??
                  workspaceData.receipts[0]?.snapshot?.bookedBy?.name ??
                  (event.quote_approved ? "Quote approved" : "Quote needed")}
              </p>
            </CardContent>
          </Card>
        </section>

        {workspaceError && (
          <div
            role="alert"
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
          >
            <span>{workspaceError}</span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void refreshWorkspace()}
            >
              Retry
            </Button>
          </div>
        )}

        {/* Guided 4-Step Pipeline Bar */}
        <section
          aria-label="Event workflow pipeline"
          className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4"
        >
          {pipelineSteps.map((item) => {
            const active = tab === item.targetTab;
            return (
              <button
                key={item.title}
                type="button"
                onClick={() => openTab(item.targetTab)}
                className={`flex items-start gap-3 rounded-2xl border p-3.5 text-left transition-all ${
                  active
                    ? "border-primary bg-white shadow-sm ring-2 ring-primary/20 dark:bg-gray-900"
                    : item.done
                      ? "border-emerald-300 bg-emerald-50/70 hover:bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30"
                      : "border-orange-200/80 bg-white/70 hover:bg-white dark:border-orange-800/60 dark:bg-gray-900/60"
                }`}
              >
                <CheckCircle2
                  className={`mt-0.5 size-5 shrink-0 ${
                    item.done
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-muted-foreground/50"
                  }`}
                />
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-primary">
                    {item.step}
                  </p>
                  <p className="truncate text-sm font-semibold">{item.title}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {item.detail}
                  </p>
                </div>
              </button>
            );
          })}
        </section>

        {/* Clean Single-Row Tab Bar */}
        <nav
          className="flex gap-1.5 overflow-x-auto rounded-2xl border border-orange-200/80 bg-white/85 p-1.5 dark:border-orange-800/60 dark:bg-gray-900/80"
          aria-label="Event workspace sections"
        >
          {tabs.map(({ id, label, icon: Icon }) => (
            <Button
              key={id}
              variant={tab === id ? "default" : "ghost"}
              size="sm"
              className="shrink-0 rounded-xl"
              onClick={() => openTab(id)}
            >
              <Icon data-icon="inline-start" />
              {label}
            </Button>
          ))}
        </nav>

        <Card className="rounded-3xl border-orange-200/80 bg-white/90 shadow-sm dark:border-orange-800/60 dark:bg-gray-900/85">
          <CardHeader>
            <CardTitle>{tabs.find((item) => item.id === tab)?.label}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {tab === "overview" && (
              <>
                <p className="text-sm leading-6 text-muted-foreground">
                  Review event schedule, client notes, and jump directly to quoting, deposit collection, or banquet setup.
                </p>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl border border-border p-4">
                    <p className="text-xs font-medium text-muted-foreground">
                      Client Name
                    </p>
                    <p className="mt-1 font-semibold">{event.client_name}</p>
                  </div>
                  <div className="rounded-2xl border border-border p-4">
                    <p className="text-xs font-medium text-muted-foreground">
                      Venue &amp; Capacity
                    </p>
                    <p className="mt-1 font-semibold">
                      {event.venue} · {event.guest_count} guests
                    </p>
                  </div>
                  <div className="rounded-2xl border border-border p-4">
                    <p className="text-xs font-medium text-muted-foreground">
                      Notes &amp; Contact Details
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {event.notes || "No special notes recorded"}
                    </p>
                  </div>
                </div>
                <div className="grid gap-4 md:grid-cols-3">
                  <Card className="border-primary/30 bg-primary/5">
                    <CardHeader>
                      <CardTitle className="text-base">
                        1. Quote &amp; Venue Booking
                      </CardTitle>
                      <p className="text-xs text-muted-foreground">
                        {event.receipt_id
                          ? "Booking secured and invoice generated."
                          : "Build package pricing and lock the venue."}
                      </p>
                    </CardHeader>
                    <CardContent>
                      <Button size="sm" onClick={() => openTab("quote")}>
                        {event.receipt_id ? "View Quote & Booking" : "Open Quote Builder"}
                      </Button>
                    </CardContent>
                  </Card>
                  <Card className="border-emerald-200 bg-emerald-50/70 dark:border-emerald-900 dark:bg-emerald-950/30">
                    <CardHeader>
                      <CardTitle className="text-base">
                        2. Deposit &amp; Payments
                      </CardTitle>
                      <p className="text-xs text-muted-foreground">
                        Paid: GHS {workspaceData.paymentsSummary.paidTotal.toFixed(2)} ·
                        Balance: GHS{" "}
                        {workspaceData.paymentsSummary.balanceDue.toFixed(2)}
                      </p>
                    </CardHeader>
                    <CardContent>
                      <Button size="sm" onClick={() => openTab("payments")}>
                        Record or Review Payments
                      </Button>
                    </CardContent>
                  </Card>
                  <Card className="border-amber-200 bg-amber-50/70 dark:border-amber-900 dark:bg-amber-950/30">
                    <CardHeader>
                      <CardTitle className="text-base">
                        3. Banquet Checklist
                      </CardTitle>
                      <p className="text-xs text-muted-foreground">
                        {workspaceData.delivery.completedTasks} completed ·{" "}
                        {workspaceData.delivery.openTasks} open tasks
                      </p>
                    </CardHeader>
                    <CardContent>
                      <Button size="sm" onClick={() => openTab("operations")}>
                        Manage Banquet Tasks
                      </Button>
                    </CardContent>
                  </Card>
                </div>
              </>
            )}

            {tab === "quote" && (
              <>
                <EventPricingDesk
                  eventId={event.id}
                  canEdit={canPrice}
                  guestCount={event.guest_count}
                  secured={Boolean(event.receipt_id)}
                  onSaved={() => void refreshWorkspace()}
                  onQuoteSecured={async () => {
                    await refreshWorkspace();
                    openTab("payments");
                  }}
                />
                <QuoteApprovalPanel
                  eventId={event.id}
                  refreshKey={quoteRefreshKey}
                  canApprove={canPrice}
                  secured={Boolean(event.receipt_id)}
                  onChanged={() => void refreshWorkspace()}
                  onSecureQuote={(quoteId) => {
                    setSelectedQuoteId(quoteId);
                    window.setTimeout(
                      () =>
                        document
                          .getElementById("event-booking-panel")
                          ?.scrollIntoView({ behavior: "smooth", block: "center" }),
                      50,
                    );
                  }}
                />
                <EventBookingPanel
                  eventId={event.id}
                  secured={Boolean(event.receipt_id)}
                  quoteApproved={Boolean(event.quote_approved)}
                  selectedQuoteId={selectedQuoteId}
                  receiptId={event.receipt_id}
                  onReviewQuote={() =>
                    document
                      .getElementById("event-pricing-desk")
                      ?.scrollIntoView({ behavior: "smooth", block: "center" })
                  }
                  onSecured={refreshWorkspace}
                />
              </>
            )}

            {tab === "payments" && (
              <EventPayments
                data={workspaceData}
                eventId={event.id}
                onRecorded={() => void refreshWorkspace()}
              />
            )}
            {tab === "finance" && (
              <EventFinance
                data={workspaceData}
                eventId={event.id}
                onGenerated={() => void refreshWorkspace()}
              />
            )}
            {tab === "operations" && (
              <EventOperations
                event={event}
                data={workspaceData}
                eventId={event.id}
                onChanged={() => void refreshWorkspace()}
              />
            )}
            {tab === "documents" && (
              <EventDocuments
                eventId={event.id}
                receiptId={event.receipt_id}
                invoiceEnabled={Boolean(
                  event.quote_approved || event.receipt_id || selectedQuoteId,
                )}
              />
            )}
            {tab === "activity" && (
              <EventActivity
                data={workspaceData}
                eventId={event.id}
                receiptId={event.receipt_id}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

type Quote = {
  id: string;
  status: string;
  subtotal: number;
  tax_amount: number;
  deposit_percent?: number;
  total: number;
  currency?: string;
  created_at: string;
  items: Array<{ label: string; quantity: number; amount: number }>;
};

function QuoteApprovalPanel({
  eventId,
  refreshKey,
  canApprove,
  secured,
  onChanged,
  onSecureQuote,
}: {
  eventId: string;
  refreshKey: number;
  canApprove: boolean;
  secured: boolean;
  onChanged: () => void;
  onSecureQuote: (quoteId: string) => void;
}) {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState("");

  const load = useCallback(
    () =>
      fetch(`/api/events/quotes?eventId=${eventId}`, { cache: "no-store" })
        .then((response) => response.json())
        .then((data) => setQuotes(data.quotes ?? []))
        .finally(() => setLoading(false)),
    [eventId],
  );

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const transition = async (
    quoteId: string,
    status: string,
    andSecure = false,
  ) => {
    setBusy(quoteId);
    setErrorMessage("");
    const response = await fetch("/api/events/quotes", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ quoteId, status }),
    });
    if (!response.ok) {
      setErrorMessage(
        (await response.json().catch(() => ({}))).error ??
          "Unable to update quote status.",
      );
      setBusy(null);
      return;
    }
    if (andSecure && !secured) {
      await fetch("/api/events/secure", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ eventId, quoteId }),
      });
    }
    await load();
    onChanged();
    setBusy(null);
  };

  if (loading)
    return (
      <p className="text-sm text-muted-foreground">Loading quote versions…</p>
    );
  if (!quotes.length)
    return (
      <div className="rounded-2xl border border-dashed p-4 text-sm text-muted-foreground">
        No saved quotes yet. Use the Quote &amp; Package Builder above to create a draft or approve &amp; secure immediately.
      </div>
    );

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">Saved Quote Versions ({quotes.length})</h3>
        <span className="text-xs text-muted-foreground">
          Approved quotes lock pricing and unlock venue confirmation.
        </span>
      </div>
      {errorMessage && (
        <p role="alert" className="text-sm text-destructive">
          {errorMessage}
        </p>
      )}
      {quotes.map((quote) => {
        const locked = ["approved", "sent", "accepted", "superseded"].includes(
          quote.status,
        );
        return (
          <div
            key={quote.id}
            className={`rounded-2xl border p-4 ${
              locked
                ? "border-amber-400 bg-amber-50/60 dark:border-amber-700 dark:bg-amber-950/20"
                : "border-border bg-background/70"
            }`}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-semibold">
                  Quote {quote.id.slice(0, 8).toUpperCase()}
                </p>
                <p className="text-xs text-muted-foreground">
                  Created {new Date(quote.created_at).toLocaleString()} ·{" "}
                  {quote.items.length} line item
                  {quote.items.length === 1 ? "" : "s"}
                </p>
              </div>
              <Badge
                variant={
                  quote.status === "approved" || quote.status === "accepted"
                    ? "default"
                    : "secondary"
                }
              >
                {quote.status.replace("_", " ")}
              </Badge>
            </div>
            {quote.items.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                {quote.items.map((item, idx) => (
                  <span
                    key={idx}
                    className="rounded-lg border border-border/70 bg-background/80 px-2.5 py-1"
                  >
                    {item.label} × {item.quantity} (GHS{" "}
                    {Number(item.amount).toFixed(2)})
                  </span>
                ))}
              </div>
            )}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <p className="text-lg font-semibold">
                {quote.currency ?? "GHS"} {Number(quote.total).toFixed(2)}
              </p>
              <div className="flex flex-wrap gap-2">
                {quote.status === "draft" && canApprove && (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void transition(quote.id, "approved", false)}
                      disabled={busy === quote.id}
                    >
                      Approve quote
                    </Button>
                    {!secured && (
                      <Button
                        size="sm"
                        className="bg-emerald-600 text-white hover:bg-emerald-700"
                        onClick={() => void transition(quote.id, "approved", true)}
                        disabled={busy === quote.id}
                      >
                        Approve &amp; Secure Venue
                      </Button>
                    )}
                  </>
                )}
                {quote.status === "draft" && !canApprove && (
                  <Button
                    size="sm"
                    onClick={() =>
                      void transition(quote.id, "pending_approval", false)
                    }
                    disabled={busy === quote.id}
                  >
                    Submit for approval
                  </Button>
                )}
                {quote.status === "pending_approval" && canApprove && (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void transition(quote.id, "approved", false)}
                      disabled={busy === quote.id}
                    >
                      Approve quote
                    </Button>
                    {!secured && (
                      <Button
                        size="sm"
                        className="bg-emerald-600 text-white hover:bg-emerald-700"
                        onClick={() => void transition(quote.id, "approved", true)}
                        disabled={busy === quote.id}
                      >
                        Approve &amp; Secure Venue
                      </Button>
                    )}
                  </>
                )}
                {quote.status === "approved" && !secured && (
                  <Button size="sm" onClick={() => onSecureQuote(quote.id)}>
                    Select to secure
                  </Button>
                )}
                {locked && (
                  <span className="self-center text-xs text-muted-foreground">
                    Locked version
                  </span>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default EventDetailWorkspace;
