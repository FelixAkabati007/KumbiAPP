"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Clock3,
  ExternalLink,
  MapPin,
  Phone,
  Plus,
  ReceiptText,
  RefreshCw,
  Sparkles,
  Trash2,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { hasPermission } from "@/lib/roles";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { RoleGuard } from "@/components/role-guard";
import { LogoDisplay } from "@/components/logo-display";

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
  receipt_id?: string | null;
  quote_approved?: boolean;
  finance_posted?: boolean;
  total_invoiced?: number;
  total_paid?: number;
  balance_due?: number;
  payment_status?: string;
};

type QuoteItem = {
  label: string;
  pricingUnit: string;
  quantity: string;
  unitPrice: string;
};

const statusLabels: Record<string, string> = {
  planning: "Planning",
  confirmed: "Confirmed",
  in_progress: "In progress",
  completed: "Completed",
  cancelled: "Cancelled",
};

const nextStatuses: Record<string, string[]> = {
  planning: ["confirmed", "cancelled"],
  confirmed: ["in_progress", "cancelled"],
  in_progress: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
};

const blankItem: QuoteItem = {
  label: "Venue hire",
  pricingUnit: "fixed",
  quantity: "1",
  unitPrice: "",
};

function EventsWorkspace() {
  const router = useRouter();
  const { user } = useAuth();
  const canPrice = Boolean(user?.role && hasPermission(user.role, "eventPricing"));

  const [events, setEvents] = useState<EventRecord[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [showQuote, setShowQuote] = useState(false);
  const [quoteEventId, setQuoteEventId] = useState("");
  const [quoteItems, setQuoteItems] = useState<QuoteItem[]>([blankItem]);
  const [discount, setDiscount] = useState("0");
  const [tax, setTax] = useState("0");
  const [deposit, setDeposit] = useState("50");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"error" | "success">("error");
  const [selectedEventId, setSelectedEventId] = useState("");
  const [eventStartTime, setEventStartTime] = useState("09:00");
  const [eventEndDate, setEventEndDate] = useState("");
  const [eventEndTime, setEventEndTime] = useState("15:00");

  async function loadEvents(silent = false) {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const response = await fetch("/api/events", { cache: "no-store" });
      if (response.ok) {
        const list: EventRecord[] = (await response.json()).events ?? [];
        setEvents(list);
        if (!selectedEventId && list[0]?.id) {
          setSelectedEventId(list[0].id);
        }
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void loadEvents();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void loadEvents(true);
    }, 15000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const eventId = new URLSearchParams(window.location.search).get("eventId");
    if (eventId) setSelectedEventId(eventId);
  }, []);

  async function createEvent(event: FormEvent<HTMLFormElement>, openAfterCreate = false) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    const form = new FormData(event.currentTarget);
    const eventDate = String(form.get("eventDate") ?? "");
    const startsAt = `${eventDate}T${eventStartTime || "09:00"}`;
    const effectiveEndDate = eventEndDate || eventDate;
    const endsAt =
      effectiveEndDate && eventEndTime
        ? `${effectiveEndDate}T${eventEndTime}`
        : null;

    if (endsAt && new Date(endsAt) <= new Date(startsAt)) {
      setMessageType("error");
      setMessage("End date and time must be after the start date and time.");
      setSaving(false);
      return;
    }

    const clientPhone = String(form.get("clientPhone") ?? "").trim();
    const extraNotes = String(form.get("notes") ?? "").trim();
    const combinedNotes = [
      clientPhone ? `Phone: ${clientPhone}` : "",
      extraNotes,
    ]
      .filter(Boolean)
      .join(" · ");

    const response = await fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.get("name"),
        clientName: form.get("clientName"),
        venue: form.get("venue"),
        startsAt,
        endsAt,
        guestCount: form.get("guestCount"),
        notes: combinedNotes || null,
      }),
    });

    const payload = await response.json().catch(() => ({}));
    if (response.ok && payload.event?.id) {
      setShowForm(false);
      event.currentTarget.reset();
      await loadEvents(true);
      setSelectedEventId(payload.event.id);
      setMessageType("success");
      setMessage(`Event "${payload.event.name}" created. Ready to build quote and secure booking.`);
      if (openAfterCreate) {
        router.push(`/events/${payload.event.id}?tab=quote`);
      }
    } else {
      setMessageType("error");
      setMessage(payload.error ?? "Unable to create event");
    }
    setSaving(false);
  }

  async function createQuote(event: FormEvent<HTMLFormElement>, autoApproveAndSecure = false) {
    event.preventDefault();
    if (!quoteEventId) return;
    setSaving(true);
    setMessage("");
    const response = await fetch("/api/events/quotes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventId: quoteEventId,
        discountAmount: discount,
        taxAmount: tax,
        depositPercent: deposit,
        autoApprove: autoApproveAndSecure,
        items: quoteItems.map((item) => ({
          label: item.label,
          pricingUnit: item.pricingUnit,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
        })),
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (response.ok) {
      if (autoApproveAndSecure && payload.quote?.id) {
        await fetch("/api/events/secure", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ eventId: quoteEventId, quoteId: payload.quote.id }),
        });
        setMessageType("success");
        setMessage("Quote approved and venue secured! Opening event workspace…");
        setShowQuote(false);
        await loadEvents(true);
        router.push(`/events/${quoteEventId}?tab=payments`);
        setSaving(false);
        return;
      }
      setMessageType("success");
      setMessage("Draft quote saved. It is ready for review and approval.");
      setShowQuote(false);
      await loadEvents(true);
    } else {
      setMessageType("error");
      setMessage(payload.error ?? "Unable to save quote");
    }
    setSaving(false);
  }

  async function updateStatus(eventId: string, status: string) {
    setMessage("");
    const response = await fetch("/api/events", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventId, status }),
    });
    if (response.ok) {
      await loadEvents(true);
    } else {
      setMessageType("error");
      setMessage((await response.json()).error ?? "Unable to update event status");
    }
  }

  function displayStatus(item: EventRecord) {
    const eventDate = new Date(item.starts_at);
    if (
      eventDate < new Date() &&
      ["planning", "confirmed", "in_progress"].includes(item.status)
    )
      return "completed";
    return item.status;
  }

  const selectedEvent =
    events.find((item) => item.id === selectedEventId) ?? events[0] ?? null;

  const selectedReadiness = useMemo(() => {
    if (!selectedEvent) return [];
    return [
      {
        label: "1. Event & Venue Scheduled",
        detail: `${selectedEvent.venue} · ${selectedEvent.guest_count} guests`,
        ready: Boolean(
          selectedEvent.name &&
            selectedEvent.client_name &&
            selectedEvent.venue &&
            selectedEvent.starts_at,
        ),
        href: `/events/${selectedEvent.id}?tab=overview`,
        cta: "Details",
      },
      {
        label: "2. Quotation Approved",
        detail: selectedEvent.quote_approved
          ? "Quote approved & locked"
          : "Draft & approve quote",
        ready: Boolean(selectedEvent.quote_approved),
        href: `/events/${selectedEvent.id}?tab=quote`,
        cta: selectedEvent.quote_approved ? "View Quote" : "Build Quote",
      },
      {
        label: "3. Venue Secured & Invoiced",
        detail: selectedEvent.receipt_id
          ? `Secured · GHS ${Number(selectedEvent.total_invoiced ?? 0).toFixed(2)}`
          : "Confirm approved quote",
        ready: Boolean(selectedEvent.receipt_id),
        href: `/events/${selectedEvent.id}?tab=quote`,
        cta: selectedEvent.receipt_id ? "View Receipt" : "Secure Venue",
      },
      {
        label: "4. Deposit / Payment Collected",
        detail:
          selectedEvent.payment_status === "paid"
            ? "Paid in full"
            : Number(selectedEvent.total_paid ?? 0) > 0
              ? `Partially paid (GHS ${Number(selectedEvent.total_paid ?? 0).toFixed(2)})`
              : "Awaiting deposit payment",
        ready: Boolean(
          selectedEvent.payment_status === "paid" ||
            Number(selectedEvent.total_paid ?? 0) > 0,
        ),
        href: `/events/${selectedEvent.id}?tab=payments`,
        cta: "Record Payment",
      },
    ];
  }, [selectedEvent]);

  const filteredEvents = useMemo(() => {
    return events.filter((item) => {
      const effectiveStatus = displayStatus(item);
      if (statusFilter !== "all" && effectiveStatus !== statusFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          item.name.toLowerCase().includes(q) ||
          item.client_name.toLowerCase().includes(q) ||
          item.venue.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [events, statusFilter, searchQuery]);

  const summary = useMemo(
    () => ({
      upcoming: events.filter((item) => new Date(item.starts_at) >= new Date())
        .length,
      planning: events.filter((item) => item.status === "planning").length,
      guests: events.reduce((sum, item) => sum + Number(item.guest_count), 0),
    }),
    [events],
  );

  const cards = [
    { label: "Upcoming events", value: summary.upcoming, icon: CalendarDays },
    { label: "Active planning", value: summary.planning, icon: ClipboardList },
    { label: "Total guests", value: summary.guests, icon: Users },
    {
      label: "Pricing authority",
      value: canPrice ? "Enabled" : "View only",
      icon: ReceiptText,
    },
  ];

  function nextAction(item: EventRecord) {
    if (!item.quote_approved) return { label: "Build & Approve Quote", tab: "quote" };
    if (!item.receipt_id) return { label: "Secure Booking", tab: "quote" };
    if (item.payment_status !== "paid") return { label: "Collect Payment", tab: "payments" };
    return { label: "Open Workspace", tab: "operations" };
  }

  const quoteTargetEvent = events.find((e) => e.id === quoteEventId);
  const quoteSubtotal = quoteItems.reduce(
    (sum, item) => sum + Number(item.quantity || 0) * Number(item.unitPrice || 0),
    0,
  );
  const quoteTotal = Math.max(
    0,
    quoteSubtotal - Number(discount || 0) + Number(tax || 0),
  );

  return (
    <main className="flex min-h-screen flex-col bg-gradient-to-br from-orange-50 via-amber-50 to-yellow-100 text-foreground dark:from-orange-950 dark:via-amber-950 dark:to-yellow-950">
      {/* Sticky Top Navbar with Application Logo */}
      <header className="sticky top-0 z-30 flex min-h-14 flex-wrap items-center justify-between gap-3 border-b border-orange-200 bg-white/90 px-3 py-2 backdrop-blur-md dark:border-orange-700 dark:bg-gray-900/90 sm:min-h-16 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <Button
            asChild
            variant="outline"
            size="icon"
            className="shrink-0 rounded-full border-orange-200 hover:bg-orange-100 dark:border-orange-700 dark:hover:bg-orange-900/30"
          >
            <Link href="/" aria-label="Back to dashboard">
              <ArrowLeft className="h-4 w-4 text-orange-600 dark:text-orange-400" />
            </Link>
          </Button>
          <LogoDisplay size="sm" />
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-orange-700 dark:text-orange-300">
              Banquet &amp; Conference Management
            </p>
            <h1 className="truncate text-lg font-bold tracking-tight sm:text-2xl">
              Event Organization
            </h1>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void loadEvents(true)}
            disabled={refreshing}
            className="rounded-xl"
          >
            <RefreshCw
              data-icon="inline-start"
              className={refreshing ? "animate-spin" : undefined}
            />
            {refreshing ? "Syncing" : "Sync"}
          </Button>
          {canPrice && (
            <Button
              variant="outline"
              size="sm"
              className="rounded-xl"
              onClick={() => {
                if (!quoteEventId && selectedEvent?.id) {
                  setQuoteEventId(selectedEvent.id);
                }
                setShowQuote((open) => !open);
              }}
            >
              <ReceiptText data-icon="inline-start" />
              {showQuote ? "Close Quote Builder" : "Quick Quote"}
            </Button>
          )}
          <Button
            size="sm"
            className="rounded-2xl bg-gradient-to-r from-orange-500 via-amber-500 to-yellow-500 text-white shadow-md hover:from-orange-600 hover:via-amber-600 hover:to-yellow-600"
            onClick={() => setShowForm((open) => !open)}
          >
            <Plus data-icon="inline-start" />
            {showForm ? "Close Form" : "New Event Booking"}
          </Button>
        </div>
      </header>

      <div className="mx-auto w-full max-w-7xl flex-1 space-y-5 p-3 pt-5 sm:p-4 md:p-8 md:pt-6">
        {message && (
          <div
            role="alert"
            className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-sm ${
              messageType === "error"
                ? "border-destructive/30 bg-destructive/5 text-destructive"
                : "border-emerald-300 bg-emerald-50/80 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200"
            }`}
          >
            <span>{message}</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setMessage("")}
              className="h-7 px-2 text-xs"
            >
              Dismiss
            </Button>
          </div>
        )}

        {/* Step 1: Streamlined New Event Form */}
        {showForm && (
          <Card className="rounded-3xl border-orange-200 bg-white/95 shadow-md dark:border-orange-800 dark:bg-gray-900/95">
            <CardHeader>
              <CardTitle>Create New Event Booking</CardTitle>
              <p className="text-sm text-muted-foreground">
                Enter client details, choose a venue (with automatic double-booking check), and set the schedule.
              </p>
            </CardHeader>
            <CardContent>
              <form
                onSubmit={(e) => void createEvent(e, true)}
                className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
              >
                <label className="grid gap-1.5 text-sm font-medium">
                  Event Name *
                  <Input
                    name="name"
                    placeholder="e.g. Traditional Wedding / Corporate Retreat"
                    required
                  />
                </label>
                <label className="grid gap-1.5 text-sm font-medium">
                  Client / Organization Name *
                  <Input
                    name="clientName"
                    placeholder="e.g. Emma & Emmanuella"
                    required
                  />
                </label>
                <label className="grid gap-1.5 text-sm font-medium">
                  <span className="flex items-center gap-1.5">
                    <Phone className="size-3.5 text-primary" />
                    Client Phone / Contact
                  </span>
                  <Input
                    name="clientPhone"
                    type="tel"
                    placeholder="e.g. +233 24 000 0000"
                  />
                </label>

                <label className="grid gap-1.5 text-sm font-medium sm:col-span-2">
                  <span className="flex items-center gap-1.5">
                    <MapPin className="size-4 text-primary" aria-hidden="true" />
                    Venue *
                  </span>
                  <Input
                    name="venue"
                    list="event-venues"
                    placeholder="Select a registered hall or type external venue"
                    autoComplete="off"
                    required
                  />
                  <datalist id="event-venues">
                    <option value="Kumbisaly Premises" />
                    <option value="Kumbi Hotel" />
                    <option value="Kumresh Conference Hall" />
                    <option value="External venue" />
                  </datalist>
                </label>

                <label className="grid gap-1.5 text-sm font-medium">
                  Expected Guest Count *
                  <Input
                    name="guestCount"
                    type="number"
                    min="1"
                    placeholder="e.g. 150"
                    required
                  />
                </label>

                <fieldset className="grid gap-3 rounded-2xl border border-border/80 bg-muted/20 p-3.5 sm:col-span-2 lg:col-span-3">
                  <legend className="px-2 text-xs font-semibold uppercase tracking-wider text-primary">
                    <span className="inline-flex items-center gap-1.5">
                      <Clock3 className="size-3.5" />
                      Event Schedule
                    </span>
                  </legend>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <label className="grid gap-1.5 text-sm font-medium">
                      Start Date *
                      <Input
                        name="eventDate"
                        type="date"
                        min={new Date().toISOString().slice(0, 10)}
                        onChange={(e) => {
                          if (!eventEndDate) setEventEndDate(e.target.value);
                        }}
                        required
                      />
                    </label>
                    <label className="grid gap-1.5 text-sm font-medium">
                      Start Time *
                      <Input
                        type="time"
                        value={eventStartTime}
                        onChange={(e) => setEventStartTime(e.target.value)}
                        required
                      />
                    </label>
                    <label className="grid gap-1.5 text-sm font-medium">
                      End Date
                      <Input
                        name="eventEndDate"
                        type="date"
                        min={new Date().toISOString().slice(0, 10)}
                        value={eventEndDate}
                        onChange={(e) => setEventEndDate(e.target.value)}
                      />
                    </label>
                    <label className="grid gap-1.5 text-sm font-medium">
                      End Time
                      <Input
                        name="eventEndTime"
                        type="time"
                        value={eventEndTime}
                        onChange={(e) => setEventEndTime(e.target.value)}
                      />
                    </label>
                  </div>
                </fieldset>

                <label className="grid gap-1.5 text-sm font-medium sm:col-span-2 lg:col-span-3">
                  Special Requests / Setup Notes (optional)
                  <Input
                    name="notes"
                    placeholder="e.g. Gold & white theme, projector needed, VIP table for 12"
                  />
                </label>

                <div className="flex flex-wrap items-center justify-end gap-2 sm:col-span-2 lg:col-span-3">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowForm(false)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={saving}>
                    {saving ? "Creating…" : "Create Event & Build Quote →"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Quick Pricing Desk Drawer */}
        {canPrice && showQuote && (
          <Card
            id="pricing"
            className="rounded-3xl border-primary/30 bg-white/95 shadow-md dark:bg-gray-900/95"
          >
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="size-5 text-primary" />
                  Quick Quotation &amp; Instant Venue Lock
                </CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  Prepare an event quote and either save as draft or approve &amp; secure the booking in one click.
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowQuote(false)}
              >
                Close
              </Button>
            </CardHeader>
            <CardContent>
              <form
                onSubmit={(e) => void createQuote(e, false)}
                className="space-y-4"
              >
                <label className="grid gap-1.5 text-sm font-medium">
                  Select Event *
                  <select
                    value={quoteEventId}
                    onChange={(event) => setQuoteEventId(event.target.value)}
                    required
                    className="h-10 rounded-xl border border-input bg-background px-3 font-normal"
                  >
                    <option value="">Select an event</option>
                    {events.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name} — {item.client_name} ({item.guest_count} guests)
                      </option>
                    ))}
                  </select>
                </label>

                <div className="space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold">Quote Items</h3>
                    <div className="flex flex-wrap gap-1.5">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 rounded-full text-xs"
                        onClick={() =>
                          setQuoteItems((items) => [
                            ...items,
                            {
                              label: "Buffet Catering",
                              pricingUnit: "per_guest",
                              quantity: String(quoteTargetEvent?.guest_count || 50),
                              unitPrice: "85",
                            },
                          ])
                        }
                      >
                        + Catering (Per Guest)
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 rounded-full text-xs"
                        onClick={() =>
                          setQuoteItems((items) => [
                            ...items,
                            {
                              label: "PA & Sound System",
                              pricingUnit: "fixed",
                              quantity: "1",
                              unitPrice: "500",
                            },
                          ])
                        }
                      >
                        + Sound System
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 rounded-xl text-xs"
                        onClick={() =>
                          setQuoteItems((items) => [
                            ...items,
                            {
                              label: "",
                              pricingUnit: "fixed",
                              quantity: "1",
                              unitPrice: "",
                            },
                          ])
                        }
                      >
                        <Plus data-icon="inline-start" />
                        Add row
                      </Button>
                    </div>
                  </div>
                  {quoteItems.map((item, index) => (
                    <div
                      key={index}
                      className="grid gap-2.5 rounded-2xl border border-border p-3 sm:grid-cols-[1.5fr_1fr_0.7fr_1fr_auto] sm:items-center"
                    >
                      <Input
                        placeholder="Service, e.g. Hall hire"
                        value={item.label}
                        onChange={(event) =>
                          setQuoteItems((items) =>
                            items.map((current, i) =>
                              i === index
                                ? { ...current, label: event.target.value }
                                : current,
                            ),
                          )
                        }
                        required
                      />
                      <select
                        value={item.pricingUnit}
                        onChange={(event) => {
                          const nextUnit = event.target.value;
                          setQuoteItems((items) =>
                            items.map((current, i) =>
                              i === index
                                ? {
                                    ...current,
                                    pricingUnit: nextUnit,
                                    quantity:
                                      nextUnit === "per_guest"
                                        ? String(
                                            quoteTargetEvent?.guest_count || 1,
                                          )
                                        : current.quantity,
                                  }
                                : current,
                            ),
                          );
                        }}
                        className="h-10 rounded-xl border border-input bg-background px-3 text-sm"
                      >
                        <option value="fixed">Fixed</option>
                        <option value="per_guest">Per guest</option>
                        <option value="per_hour">Per hour</option>
                        <option value="per_staff">Per staff</option>
                      </select>
                      <Input
                        type="number"
                        min="0.01"
                        step="0.01"
                        placeholder="Qty"
                        value={item.quantity}
                        onChange={(event) =>
                          setQuoteItems((items) =>
                            items.map((current, i) =>
                              i === index
                                ? { ...current, quantity: event.target.value }
                                : current,
                            ),
                          )
                        }
                        required
                      />
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="Unit price (GHS)"
                        value={item.unitPrice}
                        onChange={(event) =>
                          setQuoteItems((items) =>
                            items.map((current, i) =>
                              i === index
                                ? { ...current, unitPrice: event.target.value }
                                : current,
                            ),
                          )
                        }
                        required
                      />
                      {quoteItems.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() =>
                            setQuoteItems((items) =>
                              items.filter((_, i) => i !== index),
                            )
                          }
                        >
                          <Trash2 className="size-4 text-muted-foreground" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="Discount (GHS)"
                    value={discount}
                    onChange={(event) => setDiscount(event.target.value)}
                  />
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="Tax (GHS)"
                    value={tax}
                    onChange={(event) => setTax(event.target.value)}
                  />
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    step="1"
                    placeholder="Deposit %"
                    value={deposit}
                    onChange={(event) => setDeposit(event.target.value)}
                  />
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-muted/20 p-3.5">
                  <p className="text-sm text-muted-foreground">
                    Quote Total:{" "}
                    <strong className="text-foreground">
                      GHS {quoteTotal.toFixed(2)}
                    </strong>
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button type="submit" variant="outline" disabled={saving}>
                      {saving ? "Saving…" : "Save Draft Quote"}
                    </Button>
                    <Button
                      type="button"
                      disabled={saving || !quoteEventId}
                      className="bg-emerald-600 text-white hover:bg-emerald-700"
                      onClick={(e) =>
                        void createQuote(
                          e as unknown as FormEvent<HTMLFormElement>,
                          true,
                        )
                      }
                    >
                      Approve &amp; Secure Booking Now
                    </Button>
                  </div>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {/* KPI Cards */}
        <section
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
          aria-label="Event organization summary"
        >
          {cards.map(({ label, value, icon: Icon }) => (
            <Card
              key={label}
              className="min-w-0 rounded-2xl border-orange-200/80 bg-white/85 shadow-sm dark:border-orange-800/60 dark:bg-gray-900/80 sm:rounded-3xl"
            >
              <CardContent className="flex items-center justify-between gap-3 p-4 sm:p-5">
                <div>
                  <p className="text-sm text-muted-foreground">{label}</p>
                  <p className="mt-1 text-2xl font-bold text-foreground">
                    {value}
                  </p>
                </div>
                <Icon className="size-5 text-primary" aria-hidden="true" />
              </CardContent>
            </Card>
          ))}
        </section>

        {/* Master-Detail Workspace: Filterable Events List + Dynamic Selected Event Readiness Inspector */}
        <section className="grid gap-6 lg:grid-cols-[1.35fr_0.85fr]">
          <Card className="rounded-3xl border-orange-200/80 bg-white/90 shadow-sm dark:border-orange-800/60 dark:bg-gray-900/85">
            <CardHeader className="space-y-3 border-b border-border">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <CardTitle>Scheduled Events</CardTitle>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    Select any event to inspect readiness or open its full workspace.
                  </p>
                </div>
                <Badge variant="outline">{filteredEvents.length} shown</Badge>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap gap-1">
                  {["all", "planning", "confirmed", "in_progress", "completed"].map(
                    (st) => (
                      <Button
                        key={st}
                        type="button"
                        size="sm"
                        variant={statusFilter === st ? "default" : "outline"}
                        className="h-8 rounded-full text-xs"
                        onClick={() => setStatusFilter(st)}
                      >
                        {st === "all" ? "All" : statusLabels[st]}
                      </Button>
                    ),
                  )}
                </div>
                <Input
                  placeholder="Search event, client, or venue…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-8 max-w-xs rounded-xl text-xs"
                />
              </div>
            </CardHeader>
            <CardContent className="max-h-[34rem] space-y-3 overflow-y-auto p-4 sm:p-5">
              {loading ? (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  Loading events…
                </p>
              ) : filteredEvents.length === 0 ? (
                <div className="flex min-h-52 flex-col items-center justify-center gap-3 text-center">
                  <div className="rounded-2xl bg-muted p-3">
                    <CalendarDays
                      className="size-6 text-primary"
                      aria-hidden="true"
                    />
                  </div>
                  <div>
                    <h2 className="font-semibold text-foreground">
                      No matching events
                    </h2>
                    <p className="mt-1 max-w-md text-sm leading-6 text-muted-foreground">
                      Click &ldquo;New Event Booking&rdquo; above to schedule a wedding, conference, or banquet.
                    </p>
                  </div>
                </div>
              ) : (
                filteredEvents.map((item) => {
                  const isSelected = selectedEvent?.id === item.id;
                  const action = nextAction(item);
                  return (
                    <article
                      key={item.id}
                      tabIndex={0}
                      role="button"
                      onClick={() => setSelectedEventId(item.id)}
                      onKeyDown={(ev) => {
                        if (ev.key === "Enter" || ev.key === " ") {
                          ev.preventDefault();
                          setSelectedEventId(item.id);
                        }
                      }}
                      className={`flex cursor-pointer flex-col gap-3 rounded-2xl border p-4 transition-all sm:flex-row sm:items-center sm:justify-between ${
                        isSelected
                          ? "border-primary bg-gradient-to-r from-orange-100/90 via-amber-50 to-yellow-100/80 shadow-sm dark:from-orange-950/70 dark:via-amber-950/60 dark:to-yellow-950/70"
                          : "border-border bg-background/60 hover:border-primary/50 hover:bg-primary/5"
                      }`}
                    >
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="truncate font-semibold text-foreground">
                            {item.name}
                          </h2>
                          <Badge variant="secondary" className="text-[11px]">
                            {statusLabels[displayStatus(item)] ??
                              displayStatus(item)}
                          </Badge>
                          {item.receipt_id && (
                            <Badge className="bg-emerald-600 text-[11px] text-white">
                              Secured
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {item.client_name} · {item.venue} · {item.guest_count}{" "}
                          guests
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(item.starts_at).toLocaleString()}
                        </p>
                      </div>
                      <div
                        className="flex flex-wrap items-center gap-2"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {nextStatuses[item.status]?.length > 0 && (
                          <select
                            aria-label={`Update status for ${item.name}`}
                            value=""
                            onChange={(ev) => {
                              if (ev.target.value)
                                void updateStatus(item.id, ev.target.value);
                            }}
                            className="h-8 rounded-xl border border-input bg-background px-2 text-xs"
                          >
                            <option value="">Status…</option>
                            {nextStatuses[item.status].map((st) => (
                              <option key={st} value={st}>
                                {statusLabels[st]}
                              </option>
                            ))}
                          </select>
                        )}
                        <Button asChild size="sm" className="h-8 rounded-xl text-xs">
                          <Link href={`/events/${item.id}?tab=${action.tab}`}>
                            {action.label}
                            <ArrowRight className="ml-1 size-3.5" />
                          </Link>
                        </Button>
                      </div>
                    </article>
                  );
                })
              )}
            </CardContent>
          </Card>

          {/* Right Panel: Selected Event Readiness & Guided Action Inspector */}
          <Card className="rounded-3xl border-orange-200/80 bg-white/90 shadow-sm dark:border-orange-800/60 dark:bg-gray-900/85">
            <CardHeader className="border-b border-border">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-primary">
                    Selected Event Readiness
                  </p>
                  <CardTitle className="mt-1">
                    {selectedEvent ? selectedEvent.name : "No Event Selected"}
                  </CardTitle>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {selectedEvent
                      ? `${selectedEvent.client_name} · ${selectedEvent.venue}`
                      : "Select an event from the list to inspect its workflow."}
                  </p>
                </div>
                {selectedEvent && (
                  <Button asChild size="sm" variant="outline" className="rounded-xl">
                    <Link href={`/events/${selectedEvent.id}`}>
                      Open Full Workspace
                      <ExternalLink className="ml-1.5 size-3.5" />
                    </Link>
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4 p-5">
              {selectedEvent ? (
                <>
                  <div className="grid grid-cols-3 gap-2 rounded-2xl border border-border bg-muted/30 p-3 text-center">
                    <div>
                      <p className="text-[11px] text-muted-foreground">Invoiced</p>
                      <p className="text-sm font-bold">
                        GHS {Number(selectedEvent.total_invoiced ?? 0).toFixed(2)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] text-muted-foreground">Paid</p>
                      <p className="text-sm font-bold text-emerald-700 dark:text-emerald-400">
                        GHS {Number(selectedEvent.total_paid ?? 0).toFixed(2)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] text-muted-foreground">
                        Balance Due
                      </p>
                      <p className="text-sm font-bold text-orange-700 dark:text-orange-300">
                        GHS {Number(selectedEvent.balance_due ?? 0).toFixed(2)}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2.5">
                    {selectedReadiness.map((step) => (
                      <div
                        key={step.label}
                        className={`flex items-center justify-between gap-3 rounded-2xl border p-3 text-sm ${
                          step.ready
                            ? "border-emerald-200 bg-emerald-50/60 dark:border-emerald-900 dark:bg-emerald-950/30"
                            : "border-amber-200 bg-amber-50/50 dark:border-amber-900 dark:bg-amber-950/20"
                        }`}
                      >
                        <div className="flex min-w-0 items-start gap-2.5">
                          <CheckCircle2
                            className={`mt-0.5 size-4 shrink-0 ${
                              step.ready
                                ? "text-emerald-600 dark:text-emerald-400"
                                : "text-amber-600 dark:text-amber-400"
                            }`}
                            aria-hidden="true"
                          />
                          <div className="min-w-0">
                            <p className="font-medium text-foreground">
                              {step.label}
                            </p>
                            <p className="truncate text-xs text-muted-foreground">
                              {step.detail}
                            </p>
                          </div>
                        </div>
                        <Button
                          asChild
                          size="sm"
                          variant={step.ready ? "outline" : "default"}
                          className="h-8 shrink-0 rounded-xl text-xs"
                        >
                          <Link href={step.href}>{step.cta}</Link>
                        </Button>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No event selected.
                </p>
              )}
            </CardContent>
          </Card>
        </section>
      </div>
    </main>
  );
}

export default function EventsPage() {
  return (
    <RoleGuard section="events">
      <EventsWorkspace />
    </RoleGuard>
  );
}
