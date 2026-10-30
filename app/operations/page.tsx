"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowLeft, Building2, CheckCircle2, CircleDollarSign, Clock3, Play, Plus, RotateCcw, Search, Wrench } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RoleGuard } from "@/components/role-guard";
import { LogoDisplay } from "@/components/logo-display";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useRealtime } from "@/components/realtime-provider";

interface Ticket {
  id: string;
  ticket_number: string;
  room_id?: string | null;
  room_number?: string;
  issue_description: string;
  severity: string;
  status: string;
  assigned_to?: string | null;
  assigned_to_name?: string;
  created_by_name?: string;
  notes?: string | null;
  completed_at?: string | null;
  created_at: string;
}

interface RoomOption {
  id: string;
  room_number: string;
  status: string;
  room_type_name?: string;
  floor?: number | string | null;
  building?: string | null;
}

const SHARED_AREAS: Record<string, string> = {
  "shared:Kitchen Equipment & Prep": "Kitchen Equipment & Prep",
  "shared:Restaurant Dining & Bar": "Restaurant Dining & Bar",
  "shared:Event Hall & Grounds": "Event Hall & Grounds",
  "shared:Generator / Electrical": "Generator / Electrical",
  "shared:Plumbing / Water Supply": "Plumbing / Water Supply",
  shared: "Restaurant / Shared Area",
};

const QUICK_ISSUE_TEMPLATES: Array<{ label: string; text: string; severity: string }> = [
  { label: "AC / Cooling", text: "Air conditioner not cooling properly / requires servicing.", severity: "high" },
  { label: "Plumbing / Leak", text: "Water leak or drainage blockage reported.", severity: "urgent" },
  { label: "Electrical / Power", text: "Power socket / lighting fault requires electrical check.", severity: "high" },
  { label: "Water Heater", text: "Hot water heater not heating in bathroom.", severity: "normal" },
  { label: "Door Lock / Key", text: "Door lock / keycard mechanism jammed or faulty.", severity: "urgent" },
  { label: "TV / Wi-Fi", text: "Television signal or Wi-Fi connectivity issue.", severity: "low" },
  { label: "Kitchen Appliance", text: "Commercial kitchen appliance / burner / fridge requires repair.", severity: "high" },
];

function OperationsWorkspace() {
  const { toast } = useToast();
  const { lastEvent } = useRealtime();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [rooms, setRooms] = useState<RoomOption[]>([]);
  const [status, setStatus] = useState("all");
  const [severityFilter, setSeverityFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [roomsLoading, setRoomsLoading] = useState(true);
  const [showNewTicketDialog, setShowNewTicketDialog] = useState(false);
  const [savingTicket, setSavingTicket] = useState(false);
  const [editingNotesId, setEditingNotesId] = useState<string | null>(null);
  const [notesDraft, setNotesDraft] = useState("");
  const [locationTab, setLocationTab] = useState<"all" | "available" | "rooms" | "shared">("all");
  const [locationSearch, setLocationSearch] = useState("");
  const [ticketForm, setTicketForm] = useState({
    roomNumber: "",
    issueDescription: "",
    severity: "normal",
    notes: "",
    markRoomMaintenance: false,
  });

  const loadRooms = async () => {
    setRoomsLoading(true);
    try {
      const response = await fetch(`/api/hotels/rooms?t=${Date.now()}`, { cache: "no-store" });
      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data)) setRooms(data);
      }
    } catch {
      // ignore network error
    } finally {
      setRoomsLoading(false);
    }
  };

  const loadTickets = async (filterStatus = status) => {
    const response = await fetch(
      `/api/hotels/maintenance${filterStatus === "all" || filterStatus === "urgent" ? "" : `?status=${encodeURIComponent(filterStatus)}`}`,
      { cache: "no-store" },
    );
    if (response.ok) setTickets(await response.json());
    setLoading(false);
  };

  useEffect(() => {
    void loadTickets(status);
  }, [status]);

  useEffect(() => {
    if (lastEvent?.topic === "maintenance.updated" || lastEvent?.topic === "rooms.updated") {
      void loadTickets(status);
      void loadRooms();
    }
  }, [lastEvent, status]);

  useEffect(() => {
    void loadRooms();
  }, []);

  useEffect(() => {
    if (showNewTicketDialog) {
      void loadRooms();
    }
  }, [showNewTicketDialog]);

  const activeRooms = useMemo(() => {
    const byNumber = new Map<string, RoomOption>();
    for (const room of rooms) {
      if (room.status !== "inactive") {
        byNumber.set(room.room_number, room);
      }
    }
    for (const ticket of tickets) {
      if (ticket.room_id && ticket.room_number && !byNumber.has(ticket.room_number)) {
        byNumber.set(ticket.room_number, {
          id: ticket.room_id,
          room_number: ticket.room_number,
          status: "available",
          room_type_name: "Standard Room",
        });
      }
    }
    return Array.from(byNumber.values()).sort((a, b) =>
      a.room_number.localeCompare(b.room_number, undefined, { numeric: true }),
    );
  }, [rooms, tickets]);

  const availableRooms = useMemo(
    () => activeRooms.filter((room) => room.status === "available"),
    [activeRooms],
  );

  const otherExistingRooms = useMemo(
    () => activeRooms.filter((room) => room.status !== "available"),
    [activeRooms],
  );

  const openTicketsByRoom = useMemo(() => {
    const map = new Map<string, Ticket[]>();
    for (const ticket of tickets) {
      if (ticket.room_number && !["resolved", "closed", "completed"].includes(ticket.status)) {
        const list = map.get(ticket.room_number) ?? [];
        list.push(ticket);
        map.set(ticket.room_number, list);
      }
    }
    return map;
  }, [tickets]);

  const selectedRoomObj = useMemo(
    () => activeRooms.find((room) => room.room_number === ticketForm.roomNumber) ?? null,
    [activeRooms, ticketForm.roomNumber],
  );

  const selectedRoomOpenTickets = useMemo(
    () => (ticketForm.roomNumber ? openTicketsByRoom.get(ticketForm.roomNumber) ?? [] : []),
    [openTicketsByRoom, ticketForm.roomNumber],
  );

  const selectLocation = (value: string) => {
    setTicketForm((prev) => ({
      ...prev,
      roomNumber: value,
      markRoomMaintenance:
        Boolean(value) &&
        !value.startsWith("shared") &&
        ["urgent", "high"].includes(prev.severity),
    }));
  };

  const isSharedSelection = ticketForm.roomNumber.startsWith("shared");

  const createTicket = async () => {
    const roomId = isSharedSelection
      ? null
      : activeRooms.find((room) => room.room_number === ticketForm.roomNumber)?.id;
    if ((!roomId && !isSharedSelection) || !ticketForm.issueDescription.trim()) {
      toast({ title: "Location and issue description are required", variant: "destructive" });
      return;
    }
    const areaPrefix =
      isSharedSelection && ticketForm.roomNumber !== "shared"
        ? `[${SHARED_AREAS[ticketForm.roomNumber]}] `
        : "";
    const finalDescription = `${areaPrefix}${ticketForm.issueDescription.trim()}`;

    setSavingTicket(true);
    try {
      const response = await fetch("/api/hotels/maintenance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomId,
          issueDescription: finalDescription,
          severity: ticketForm.severity,
          notes: ticketForm.notes.trim() || null,
          markRoomMaintenance: roomId ? ticketForm.markRoomMaintenance : false,
        }),
      });
      if (!response.ok) throw new Error("Failed to create ticket");
      toast({ title: "Maintenance ticket created" });
      setShowNewTicketDialog(false);
      setTicketForm({
        roomNumber: "",
        issueDescription: "",
        severity: "normal",
        notes: "",
        markRoomMaintenance: false,
      });
      await loadTickets(status);
    } catch {
      toast({ title: "Failed to create maintenance ticket", variant: "destructive" });
    } finally {
      setSavingTicket(false);
    }
  };

  const updateTicket = async (
    ticketId: string,
    patch: { status?: string; severity?: string; notes?: string | null },
    successMessage: string,
  ) => {
    const response = await fetch(`/api/hotels/maintenance/${ticketId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!response.ok) {
      toast({ title: "Failed to update ticket", variant: "destructive" });
      return;
    }
    const updated = await response.json();
    toast({ title: successMessage });
    setTickets((current) =>
      current.map((ticket) => (ticket.id === ticketId ? { ...ticket, ...updated } : ticket)),
    );
    setEditingNotesId(null);
  };

  const stats = useMemo(
    () => ({
      open: tickets.filter((t) => !["resolved", "closed", "completed"].includes(t.status)).length,
      urgent: tickets.filter(
        (t) => ["urgent", "high"].includes(t.severity) && !["resolved", "closed", "completed"].includes(t.status),
      ).length,
      assigned: tickets.filter(
        (t) => Boolean(t.assigned_to_name || t.assigned_to) && !["resolved", "closed", "completed"].includes(t.status),
      ).length,
      resolved: tickets.filter((t) => ["resolved", "closed", "completed"].includes(t.status)).length,
    }),
    [tickets],
  );

  const filteredTickets = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return tickets.filter((ticket) => {
      if (status === "urgent" && (!["urgent", "high"].includes(ticket.severity) || ["resolved", "closed", "completed"].includes(ticket.status))) {
        return false;
      }
      if (severityFilter !== "all" && ticket.severity !== severityFilter) {
        return false;
      }
      if (!q) return true;
      const haystack = `${ticket.ticket_number} ${ticket.room_number ? `room ${ticket.room_number}` : "restaurant shared kitchen"} ${ticket.issue_description} ${ticket.notes || ""} ${ticket.assigned_to_name || ""}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [tickets, status, severityFilter, searchQuery]);

  const statCards: Array<{ key: string; label: string; value: number; Icon: typeof Wrench }> = [
    { key: "open", label: "Open issues", value: stats.open, Icon: Wrench },
    { key: "urgent", label: "Urgent or high", value: stats.urgent, Icon: AlertTriangle },
    { key: "assigned", label: "Assigned", value: stats.assigned, Icon: Clock3 },
    { key: "resolved", label: "Resolved", value: stats.resolved, Icon: CheckCircle2 },
  ];

  return (
    <main className="min-h-screen bg-gradient-to-br from-orange-50 via-amber-50 to-yellow-100 text-foreground dark:from-orange-950 dark:via-amber-950 dark:to-yellow-950">
      <header className="sticky top-0 z-20 flex min-h-16 flex-wrap items-center justify-between gap-3 border-b border-orange-200 bg-white/80 px-3 py-3 backdrop-blur-md dark:border-orange-700 dark:bg-gray-900/80 sm:px-4 md:px-6">
        <div className="flex items-center gap-2 sm:gap-3">
          <Button asChild variant="outline" size="sm" className="rounded-xl border-orange-200 bg-white/80 dark:border-orange-700 dark:bg-gray-800/80">
            <Link href="/"><ArrowLeft data-icon="inline-start" />Back to Dashboard</Link>
          </Button>
          <LogoDisplay size="sm" />
          <div className="flex items-center gap-2">
            <Wrench className="h-5 w-5 text-orange-600 dark:text-orange-400" aria-hidden="true" />
            <span className="text-base font-semibold text-gray-800 dark:text-gray-200 sm:text-lg">Technical Operations</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="outline" size="sm" className="rounded-xl border-orange-200 bg-white/80 dark:border-orange-700 dark:bg-gray-800/80">
            <Link href="/expenses"><CircleDollarSign className="mr-1.5 h-4 w-4 text-orange-600" />Repair Expenses</Link>
          </Button>
          <Button asChild variant="outline" size="sm" className="rounded-xl border-orange-200 bg-white/80 dark:border-orange-700 dark:bg-gray-800/80"><Link href="/announcements">Announcements</Link></Button>
          <Badge variant="outline" className="w-fit">Reports to General Manager</Badge>
          <Button onClick={() => setShowNewTicketDialog(true)} size="sm" className="rounded-xl bg-orange-500 text-white hover:bg-orange-600"><Plus className="mr-1.5 h-4 w-4" />New Ticket</Button>
          <Select value={status} onValueChange={setStatus}><SelectTrigger className="h-9 w-36 sm:w-44"><SelectValue placeholder="Filter status" /></SelectTrigger><SelectContent><SelectItem value="all">All statuses</SelectItem><SelectItem value="open">Open</SelectItem><SelectItem value="urgent">Urgent / High</SelectItem><SelectItem value="assigned">Assigned</SelectItem><SelectItem value="in_progress">In progress</SelectItem><SelectItem value="resolved">Resolved</SelectItem></SelectContent></Select>
        </div>
      </header>
      <div className="mx-auto max-w-7xl space-y-6 p-3 pt-5 sm:p-4 md:p-8 md:pt-6">
        <div className="border-b border-orange-200 pb-4 dark:border-orange-700">
          <p className="text-sm font-medium text-orange-600 dark:text-orange-400">Operations control</p>
          <h1 className="text-3xl font-bold tracking-tight text-gray-800 dark:text-gray-200">Technical Operations</h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">Create, assign, track in-progress work, and resolve maintenance tickets across hotel rooms, kitchen, and shared facilities.</p>
        </div>
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="Operations summary">
          {statCards.map(({ key, label, value, Icon }) => {
            const isActive = status === key;
            return (
              <Card
                key={label}
                role="button"
                tabIndex={0}
                onClick={() => setStatus((current) => (current === key ? "all" : key))}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setStatus((current) => (current === key ? "all" : key));
                  }
                }}
                className={`relative cursor-pointer overflow-hidden rounded-3xl border bg-white/70 shadow-sm backdrop-blur-sm transition-all duration-300 hover:scale-[1.02] hover:shadow-xl dark:bg-gray-800/70 ${
                  isActive
                    ? "border-orange-500 ring-2 ring-orange-500/40 dark:border-orange-400"
                    : "border-orange-200 dark:border-orange-700"
                }`}
              >
                <div className="absolute inset-0 bg-gradient-to-br from-orange-100/20 via-amber-100/20 to-yellow-100/20 dark:from-orange-900/20 dark:via-amber-900/20 dark:to-yellow-900/20" />
                <CardContent className="relative z-10 flex items-center justify-between p-5">
                  <div>
                    <p className="text-sm text-muted-foreground">{label}</p>
                    <p className="mt-1 text-2xl font-bold text-orange-700 dark:text-orange-300">{value}</p>
                  </div>
                  <Icon className="size-5 text-orange-600 dark:text-orange-400" aria-hidden="true" />
                </CardContent>
              </Card>
            );
          })}
        </section>
        <Card className="rounded-3xl border border-orange-200 bg-white/70 shadow-sm backdrop-blur-sm dark:border-orange-700 dark:bg-gray-800/70">
          <CardHeader className="flex flex-col gap-3 rounded-t-3xl bg-gradient-to-r from-orange-500/10 via-amber-500/10 to-yellow-500/10 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-gray-800 dark:text-gray-200">Maintenance queue ({filteredTickets.length})</CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search room, ticket #, issue..."
                  className="h-9 rounded-xl border-orange-200 bg-white/80 pl-9 text-sm dark:border-orange-700 dark:bg-gray-800/80"
                />
              </div>
              <Select value={severityFilter} onValueChange={setSeverityFilter}>
                <SelectTrigger className="h-9 w-36 rounded-xl border-orange-200 bg-white/80 dark:border-orange-700 dark:bg-gray-800/80">
                  <SelectValue placeholder="All severities" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All severities</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            {loading ? (
              <p className="py-10 text-center text-muted-foreground">Loading maintenance issues…</p>
            ) : filteredTickets.length === 0 ? (
              <p className="py-10 text-center text-muted-foreground">No maintenance issues match this filter.</p>
            ) : (
              <div className="space-y-3">
                {filteredTickets.map((ticket) => {
                  const isClosed = ["resolved", "closed", "completed"].includes(ticket.status);
                  const isInProgress = ticket.status === "in_progress";
                  return (
                    <article
                      key={ticket.id}
                      className="flex flex-col gap-3 rounded-2xl border border-orange-200 bg-white/60 p-4 shadow-sm dark:border-orange-700 dark:bg-gray-800/50"
                    >
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div className="flex gap-3">
                          <Building2 className="mt-1 size-5 shrink-0 text-orange-600 dark:text-orange-400" aria-hidden="true" />
                          <div className="space-y-1">
                            <p className="font-semibold text-gray-900 dark:text-gray-100">
                              {ticket.ticket_number} · {ticket.room_number ? `Room ${ticket.room_number}` : "Restaurant / shared area"}
                            </p>
                            <p className="text-sm text-foreground">{ticket.issue_description}</p>
                            {ticket.notes && (
                              <p className="rounded-lg border border-orange-200/70 bg-orange-50/60 px-2.5 py-1.5 text-xs text-orange-950 dark:border-orange-800/60 dark:bg-orange-950/30 dark:text-orange-200">
                                <span className="font-semibold">Notes:</span> {ticket.notes}
                              </p>
                            )}
                            <p className="text-xs text-muted-foreground">
                              Created {new Date(ticket.created_at).toLocaleDateString()}
                              {ticket.created_by_name ? ` by ${ticket.created_by_name}` : ""} ·{" "}
                              {ticket.assigned_to_name ? `Assigned to ${ticket.assigned_to_name}` : "Unassigned"}
                              {ticket.completed_at ? ` · Resolved ${new Date(ticket.completed_at).toLocaleString()}` : ""}
                            </p>
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 pl-8 md:pl-0">
                          <Badge variant={ticket.severity === "urgent" || ticket.severity === "high" ? "destructive" : "secondary"}>
                            {ticket.severity}
                          </Badge>
                          <Badge variant="outline">{ticket.status.replace("_", " ")}</Badge>
                          {!isClosed && !isInProgress && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="min-h-9 rounded-xl border-orange-200 hover:bg-orange-50 dark:border-orange-700"
                              onClick={() => void updateTicket(ticket.id, { status: "in_progress" }, "Ticket marked In Progress")}
                            >
                              <Play className="mr-1 h-3.5 w-3.5 text-orange-600" />
                              Start Work
                            </Button>
                          )}
                          {!isClosed && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="min-h-9 rounded-xl border-emerald-300 bg-emerald-50/70 text-emerald-800 hover:bg-emerald-100 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200"
                              onClick={() => void updateTicket(ticket.id, { status: "resolved" }, "Ticket marked as resolved")}
                            >
                              <CheckCircle2 className="mr-1 h-4 w-4" />
                              Resolve
                            </Button>
                          )}
                          {isClosed && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="min-h-9 rounded-xl"
                              onClick={() => void updateTicket(ticket.id, { status: "open" }, "Ticket reopened")}
                            >
                              <RotateCcw className="mr-1 h-3.5 w-3.5" />
                              Reopen
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="min-h-9 rounded-xl text-xs"
                            onClick={() => {
                              if (editingNotesId === ticket.id) {
                                setEditingNotesId(null);
                              } else {
                                setEditingNotesId(ticket.id);
                                setNotesDraft(ticket.notes || "");
                              }
                            }}
                          >
                            {ticket.notes ? "Edit Note" : "+ Note"}
                          </Button>
                        </div>
                      </div>
                      {editingNotesId === ticket.id && (
                        <div className="mt-2 flex flex-col gap-2 border-t border-orange-200/60 pt-3 sm:flex-row sm:items-center dark:border-orange-800/60">
                          <Input
                            value={notesDraft}
                            onChange={(e) => setNotesDraft(e.target.value)}
                            placeholder="Add technician progress or resolution notes..."
                            className="h-9 flex-1 rounded-xl bg-background text-sm"
                          />
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              className="rounded-xl bg-orange-500 text-white hover:bg-orange-600"
                              onClick={() => void updateTicket(ticket.id, { notes: notesDraft.trim() || null }, "Ticket notes saved")}
                            >
                              Save Note
                            </Button>
                            <Button size="sm" variant="outline" className="rounded-xl" onClick={() => setEditingNotesId(null)}>
                              Cancel
                            </Button>
                          </div>
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
        <Dialog open={showNewTicketDialog} onOpenChange={setShowNewTicketDialog}>
          <DialogContent className="unit-selector-scroll-viewport max-h-[90vh] max-w-xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create Maintenance Ticket</DialogTitle>
              <DialogDescription>Report a repair or technical issue across hotel rooms, kitchen, or shared areas.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4">
              <div className="space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Label htmlFor="operations-room">Room Number / Facility Area</Label>
                    <button
                      type="button"
                      onClick={() => void loadRooms()}
                      className="inline-flex items-center gap-1 rounded-md border border-orange-200 bg-white/80 px-2 py-0.5 text-[11px] font-medium text-orange-700 hover:bg-orange-50 dark:border-orange-800 dark:bg-gray-800/80 dark:text-orange-300"
                      title="Refresh hotel rooms list"
                    >
                      <RotateCcw className={`h-3 w-3 ${roomsLoading ? "animate-spin" : ""}`} />
                      {roomsLoading ? "Loading..." : `Refresh (${activeRooms.length} rooms)`}
                    </button>
                  </div>
                  {ticketForm.roomNumber && (
                    <Badge variant="outline" className="border-orange-300 bg-orange-50 text-orange-800 dark:border-orange-700 dark:bg-orange-950/50 dark:text-orange-200">
                      Selected: {isSharedSelection ? SHARED_AREAS[ticketForm.roomNumber] || "Shared Area" : `Room ${ticketForm.roomNumber}`}
                    </Badge>
                  )}
                </div>

                {/* Synchronized Quick Dropdown */}
                <select
                  id="operations-room"
                  value={ticketForm.roomNumber}
                  onChange={(event) => selectLocation(event.target.value)}
                  className="h-10 w-full rounded-lg border border-orange-200 bg-background px-3 text-sm dark:border-orange-800"
                >
                  <option value="">Select a room or facility area</option>
                  <optgroup label={`Available Hotel Rooms (${availableRooms.length})`}>
                    {availableRooms.map((room) => (
                      <option key={room.id} value={room.room_number}>
                        Room {room.room_number}{room.room_type_name ? ` — ${room.room_type_name}` : ""} (Available)
                      </option>
                    ))}
                  </optgroup>
                  {otherExistingRooms.length > 0 && (
                    <optgroup label={`Occupied / Other Hotel Rooms (${otherExistingRooms.length})`}>
                      {otherExistingRooms.map((room) => (
                        <option key={room.id} value={room.room_number}>
                          Room {room.room_number}{room.room_type_name ? ` — ${room.room_type_name}` : ""} ({room.status})
                        </option>
                      ))}
                    </optgroup>
                  )}
                  <optgroup label="Restaurant & Shared Facilities">
                    <option value="shared:Kitchen Equipment & Prep">Kitchen Equipment &amp; Prep Area</option>
                    <option value="shared:Restaurant Dining & Bar">Restaurant Dining &amp; Bar</option>
                    <option value="shared:Event Hall & Grounds">Event Hall &amp; Grounds</option>
                    <option value="shared:Generator / Electrical">Generator / Electrical / Power</option>
                    <option value="shared:Plumbing / Water Supply">Plumbing / Water Supply</option>
                    <option value="shared">General Shared Area</option>
                  </optgroup>
                </select>

                {/* Filter Tabs + Search for Vertically Scrollable Room & Facility List */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      { id: "all", label: `All (${activeRooms.length + Object.keys(SHARED_AREAS).length})` },
                      { id: "available", label: `Available Rooms (${availableRooms.length})` },
                      { id: "rooms", label: `All Rooms (${activeRooms.length})` },
                      { id: "shared", label: "Shared Facilities (6)" },
                    ].map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setLocationTab(tab.id as "all" | "available" | "rooms" | "shared")}
                        className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                          locationTab === tab.id
                            ? "bg-orange-500 text-white shadow-sm"
                            : "border border-orange-200 bg-white/80 text-muted-foreground hover:bg-orange-50 dark:border-orange-800 dark:bg-gray-800/80"
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                  <div className="relative w-full sm:w-44">
                    <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                    <input
                      type="text"
                      value={locationSearch}
                      onChange={(e) => setLocationSearch(e.target.value)}
                      placeholder="Filter room # or area..."
                      className="h-8 w-full rounded-lg border border-orange-200 bg-background pl-8 pr-2.5 text-xs dark:border-orange-800"
                    />
                  </div>
                </div>

                {/* Vertically Scrollable Room & Facility Picker Box */}
                <div
                  role="listbox"
                  aria-label="Scrollable Room Number and Facility Area list"
                  className="unit-selector-scroll-viewport max-h-56 overflow-y-scroll rounded-xl border border-orange-200/80 bg-white/70 p-2 pr-1.5 shadow-inner dark:border-orange-800/80 dark:bg-gray-900/50"
                >
                  <div className="space-y-2">
                    {locationTab !== "shared" && (
                      <div className="space-y-1">
                        <p className="px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                          Available Hotel Rooms ({availableRooms.length})
                        </p>
                        {availableRooms
                          .filter((room) => {
                            const q = locationSearch.trim().toLowerCase();
                            if (!q) return true;
                            return `room ${room.room_number} ${room.room_type_name || ""} floor ${room.floor ?? ""} ${room.building ?? ""}`.toLowerCase().includes(q);
                          })
                          .map((room) => {
                            const isSelected = ticketForm.roomNumber === room.room_number;
                            const openCount = openTicketsByRoom.get(room.room_number)?.length ?? 0;
                            return (
                              <button
                                key={room.id}
                                type="button"
                                role="option"
                                aria-selected={isSelected}
                                onClick={() => selectLocation(room.room_number)}
                                className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors ${
                                  isSelected
                                    ? "bg-orange-500 font-semibold text-white"
                                    : "hover:bg-orange-100/70 dark:hover:bg-orange-950/40"
                                }`}
                              >
                                <span>
                                  Room {room.room_number}
                                  {room.room_type_name ? ` · ${room.room_type_name}` : ""}
                                  {room.floor ? ` (Floor ${room.floor})` : ""}
                                </span>
                                <span className="flex items-center gap-1.5">
                                  {openCount > 0 && (
                                    <span
                                      className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                                        isSelected
                                          ? "bg-white/25 text-white"
                                          : "bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300"
                                      }`}
                                    >
                                      {openCount} open
                                    </span>
                                  )}
                                  <span
                                    className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                                      isSelected
                                        ? "bg-white/20 text-white"
                                        : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
                                    }`}
                                  >
                                    Available
                                  </span>
                                </span>
                              </button>
                            );
                          })}
                        {availableRooms.length === 0 && (
                          <p className="px-2 py-1 text-xs text-muted-foreground">
                            {roomsLoading ? "Loading hotel rooms…" : "No available rooms right now."}
                          </p>
                        )}
                      </div>
                    )}

                    {(locationTab === "all" || locationTab === "rooms") && otherExistingRooms.length > 0 && (
                      <div className="space-y-1 pt-1">
                        <p className="px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-orange-700 dark:text-orange-400">
                          Occupied / Other Existing Rooms ({otherExistingRooms.length})
                        </p>
                        {otherExistingRooms
                          .filter((room) => {
                            const q = locationSearch.trim().toLowerCase();
                            if (!q) return true;
                            return `room ${room.room_number} ${room.room_type_name || ""} ${room.status} floor ${room.floor ?? ""} ${room.building ?? ""}`.toLowerCase().includes(q);
                          })
                          .map((room) => {
                            const isSelected = ticketForm.roomNumber === room.room_number;
                            const openCount = openTicketsByRoom.get(room.room_number)?.length ?? 0;
                            return (
                              <button
                                key={room.id}
                                type="button"
                                role="option"
                                aria-selected={isSelected}
                                onClick={() => selectLocation(room.room_number)}
                                className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors ${
                                  isSelected
                                    ? "bg-orange-500 font-semibold text-white"
                                    : "hover:bg-orange-100/70 dark:hover:bg-orange-950/40"
                                }`}
                              >
                                <span>
                                  Room {room.room_number}
                                  {room.room_type_name ? ` · ${room.room_type_name}` : ""}
                                  {room.floor ? ` (Floor ${room.floor})` : ""}
                                </span>
                                <span className="flex items-center gap-1.5">
                                  {openCount > 0 && (
                                    <span
                                      className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                                        isSelected
                                          ? "bg-white/25 text-white"
                                          : "bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300"
                                      }`}
                                    >
                                      {openCount} open
                                    </span>
                                  )}
                                  <span
                                    className={`rounded-full px-2 py-0.5 text-[10px] font-medium capitalize ${
                                      isSelected
                                        ? "bg-white/20 text-white"
                                        : "bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-300"
                                    }`}
                                  >
                                    {room.status}
                                  </span>
                                </span>
                              </button>
                            );
                          })}
                      </div>
                    )}

                    {(locationTab === "all" || locationTab === "shared") && (
                      <div className="space-y-1 pt-1">
                        <p className="px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                          Restaurant &amp; Shared Facilities
                        </p>
                        {Object.entries(SHARED_AREAS)
                          .filter(([, label]) => {
                            const q = locationSearch.trim().toLowerCase();
                            return !q || label.toLowerCase().includes(q);
                          })
                          .map(([key, label]) => {
                            const isSelected = ticketForm.roomNumber === key;
                            return (
                              <button
                                key={key}
                                type="button"
                                role="option"
                                aria-selected={isSelected}
                                onClick={() => selectLocation(key)}
                                className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors ${
                                  isSelected
                                    ? "bg-orange-500 font-semibold text-white"
                                    : "hover:bg-orange-100/70 dark:hover:bg-orange-950/40"
                                }`}
                              >
                                <span>{label}</span>
                                <span
                                  className={`rounded-full px-2 py-0.5 text-[10px] ${
                                    isSelected ? "bg-white/20 text-white" : "bg-muted text-muted-foreground"
                                  }`}
                                >
                                  Facility
                                </span>
                              </button>
                            );
                          })}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-1">
                  <Label htmlFor="operations-issue">Issue Description</Label>
                  <span className="text-[11px] text-muted-foreground">Quick templates:</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {QUICK_ISSUE_TEMPLATES.map((tpl) => (
                    <button
                      key={tpl.label}
                      type="button"
                      onClick={() =>
                        setTicketForm((prev) => ({
                          ...prev,
                          issueDescription: prev.issueDescription.trim()
                            ? `${prev.issueDescription.trim()} — ${tpl.text}`
                            : tpl.text,
                          severity: tpl.severity,
                          markRoomMaintenance:
                            Boolean(prev.roomNumber) &&
                            !prev.roomNumber.startsWith("shared") &&
                            ["urgent", "high"].includes(tpl.severity),
                        }))
                      }
                      className="rounded-lg border border-orange-200 bg-orange-50/70 px-2.5 py-1 text-xs font-medium text-orange-900 transition-colors hover:bg-orange-100 dark:border-orange-800 dark:bg-orange-950/40 dark:text-orange-200"
                    >
                      + {tpl.label}
                    </button>
                  ))}
                </div>
                <textarea
                  id="operations-issue"
                  value={ticketForm.issueDescription}
                  onChange={(event) => setTicketForm({ ...ticketForm, issueDescription: event.target.value })}
                  className="min-h-24 w-full rounded-lg border bg-background px-3 py-2 text-sm"
                  placeholder="Describe the repair or technical issue..."
                />
              </div>
              <div>
                <Label htmlFor="operations-severity">Severity</Label>
                <select
                  id="operations-severity"
                  value={ticketForm.severity}
                  onChange={(event) => {
                    const nextSeverity = event.target.value;
                    setTicketForm((prev) => ({
                      ...prev,
                      severity: nextSeverity,
                      markRoomMaintenance:
                        Boolean(prev.roomNumber) &&
                        !prev.roomNumber.startsWith("shared") &&
                        ["urgent", "high"].includes(nextSeverity),
                    }));
                  }}
                  className="h-10 w-full rounded-lg border bg-background px-3 text-sm"
                >
                  <option value="low">Low</option>
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>
              {ticketForm.roomNumber && !isSharedSelection && (
                <div className="space-y-2">
                  <label className="flex items-center gap-2 rounded-lg border border-orange-200 bg-orange-50/60 px-3 py-2 text-sm dark:border-orange-800 dark:bg-orange-950/30">
                    <input
                      type="checkbox"
                      checked={ticketForm.markRoomMaintenance}
                      onChange={(e) => setTicketForm({ ...ticketForm, markRoomMaintenance: e.target.checked })}
                    />
                    <span>Place Room {ticketForm.roomNumber} in Maintenance status until resolved</span>
                  </label>
                  {selectedRoomObj?.status === "occupied" && (
                    <p className="rounded-lg border border-amber-300 bg-amber-50/80 px-3 py-1.5 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                      Note: Room {ticketForm.roomNumber} is currently occupied. Please coordinate access timing with Front Desk before entering.
                    </p>
                  )}
                  {selectedRoomOpenTickets.length > 0 && (
                    <div className="rounded-lg border border-red-200 bg-red-50/80 px-3 py-2 text-xs text-red-900 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200">
                      <p className="font-semibold">
                        Existing Open Ticket{selectedRoomOpenTickets.length > 1 ? "s" : ""} on Room {ticketForm.roomNumber}:
                      </p>
                      <ul className="mt-1 list-disc space-y-0.5 pl-4">
                        {selectedRoomOpenTickets.slice(0, 3).map((openTicket) => (
                          <li key={openTicket.id}>
                            <span className="font-medium">{openTicket.ticket_number}:</span> {openTicket.issue_description} ({openTicket.status.replace("_", " ")})
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
              <div>
                <Label htmlFor="operations-notes">Technician / Handover Notes</Label>
                <textarea
                  id="operations-notes"
                  value={ticketForm.notes}
                  onChange={(event) => setTicketForm({ ...ticketForm, notes: event.target.value })}
                  className="min-h-20 w-full rounded-lg border bg-background px-3 py-2 text-sm"
                  placeholder="Parts needed, access instructions, or contractor details..."
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-4">
              <Button variant="outline" onClick={() => setShowNewTicketDialog(false)}>Cancel</Button>
              <Button onClick={createTicket} disabled={savingTicket} className="bg-orange-500 text-white hover:bg-orange-600">
                {savingTicket ? "Creating…" : "Create Ticket"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </main>
  );
}

export default function OperationsPage() { return <RoleGuard section="operations"><OperationsWorkspace /></RoleGuard>; }
