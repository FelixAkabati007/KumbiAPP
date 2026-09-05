"use client";

import { useEffect, useState } from "react";
import { Download, Eye } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/currency";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface Authorization {
  id: string;
  guest_name: string;
  scope: string;
  approved_amount: string;
  valid_until: string;
  reason: string;
  ceo_reference: string | null;
  status: string;
  created_at: string;
  used_amount: string;
  remaining_amount: string;
  room_id?: string | null;
  stay_nights?: number | null;
  room_waived?: boolean;
  folio_waived?: boolean;
}

export function ComplimentaryAuthorizationsPanel() {
  const [items, setItems] = useState<Authorization[]>([]);
  const [guestName, setGuestName] = useState("");
  const [amount, setAmount] = useState("");
  const [validUntil, setValidUntil] = useState(() => {
    const expiry = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const local = new Date(expiry.getTime() - expiry.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 16);
  });
  const [reason, setReason] = useState("");
  const [reference, setReference] = useState("");
  const [scope, setScope] = useState("both");
  const [rooms, setRooms] = useState<Array<{ id: string; room_number: string; room_type_name: string; status: string; price: number }>>([]);
  const [roomId, setRoomId] = useState("");
  const [stayNights, setStayNights] = useState("1");
  const [activateStay, setActivateStay] = useState(true);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<(Authorization & { usage?: Array<{ id: string; amount_used: string; transaction_type?: string; transaction_id?: string; applied_by?: string }>; audit_log?: Array<{ id: string; action: string; actor_id?: string; details?: { reason?: string; roomId?: string }; created_at: string }> }) | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const load = async () => {
    const response = await fetch("/api/admin/complimentary-authorizations");
    if (response.ok) setItems(await response.json());
  };

  useEffect(() => {
    void load();
    void fetch("/api/hotels/rooms?status=available,dirty,cleaning").then((response) => response.ok ? response.json() : []).then((data) => setRooms(Array.isArray(data) ? data : []));
  }, []);

  const viewAuthorization = async (id: string) => {
    setDetailLoading(true);
    const response = await fetch(`/api/admin/complimentary-authorizations/${id}`);
    if (response.ok) setSelected(await response.json());
    else setMessage("Unable to load authorization details.");
    setDetailLoading(false);
  };

  const downloadAuthorizations = () => {
    window.location.assign("/api/admin/complimentary-authorizations/export");
  };

  const revokeAuthorization = async (id: string) => {
    const response = await fetch("/api/admin/complimentary-authorizations", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    const data = await response.json();
    setMessage(response.ok ? "Authorization revoked." : data.error || "Unable to revoke authorization");
    if (response.ok) await load();
  };

  const createAuthorization = async () => {
    if (!guestName.trim() || Number(amount) <= 0 || !reason.trim()) {
      setMessage("Guest, a positive amount, and a business reason are required.");
      return;
    }
    const expiry = new Date(validUntil);
    if (!validUntil || Number.isNaN(expiry.getTime()) || expiry <= new Date()) {
      setMessage("Valid until must be a future date and time.");
      return;
    }
    setSaving(true);
    setMessage("");
    const response = await fetch("/api/admin/complimentary-authorizations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ guestName, scope, approvedAmount: amount, validUntil, reason, ceoReference: reference, roomId: roomId || undefined, stayNights: roomId ? Number(stayNights) : undefined, activateStay }),
    });
    const data = await response.json();
    if (!response.ok) setMessage(data.error || "Unable to create authorization");
    else {
      setGuestName(""); setAmount(""); setRoomId(""); setStayNights("1"); setValidUntil(() => {
        const expiry = new Date(Date.now() + 24 * 60 * 60 * 1000);
        const local = new Date(expiry.getTime() - expiry.getTimezoneOffset() * 60000);
        return local.toISOString().slice(0, 16);
      }); setReason(""); setReference("");
      setMessage("Authorization created and available for controlled application.");
      await load();
    }
    setSaving(false);
  };

  return (
    <Card className="border-emerald-200 bg-white/80">
      <CardHeader className="space-y-2 p-4 sm:p-6">
        <CardTitle className="text-lg text-emerald-900 sm:text-xl">VIP / Complimentary Exceptions</CardTitle>
        <p className="text-sm text-muted-foreground">Reception can create and operate approved stays. Admin can review the audit log, extend, or revoke any exception.</p>
      </CardHeader>
      <CardContent className="space-y-5 p-4 sm:p-6">
        <div className="rounded-xl border border-emerald-200 bg-gradient-to-br from-white via-emerald-50 to-emerald-100 p-4 text-emerald-950 shadow-sm">
          <p className="text-sm font-semibold">How complimentary usage affects finance and stock</p>
          <p className="mt-1 text-sm leading-6 text-emerald-900/80">Gross Value is the normal selling price before an exception. Complimentary is the amount waived for the guest. Net Collected is what the guest actually pays. Cost is the real food, beverage, room-service, event, or operating cost consumed. Net Impact is Net Collected minus Cost.</p>
          <p className="mt-2 text-sm leading-6 text-emerald-900/80"><span className="font-semibold">Stock rule:</span> approvals only waive charges. The fulfilled restaurant, hotel, or event order still deducts its normal recipe or inventory quantities, exactly once.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Input aria-label="Guest name" placeholder="Guest name" value={guestName} onChange={(event) => setGuestName(event.target.value)} />
          <Input aria-label="Approved amount" type="number" min="0" placeholder="Approved amount" value={amount} onChange={(event) => setAmount(event.target.value)} />
          <Input aria-label="Valid until" type="datetime-local" value={validUntil} onChange={(event) => setValidUntil(event.target.value)} />
          <select aria-label="Scope" className="h-10 rounded-md border bg-background px-3 text-sm" value={scope} onChange={(event) => setScope(event.target.value)}>
            <option value="both">Hotel and restaurant</option><option value="hotel">Hotel</option><option value="restaurant">Restaurant</option><option value="event">Event Organization</option>
          </select>
          <select aria-label="VIP room" className="h-10 min-w-0 rounded-md border bg-background px-3 text-sm" value={roomId} onChange={(event) => setRoomId(event.target.value)}>
            <option value="">No room stay / link later</option>
            {rooms.map((room) => <option key={room.id} value={room.id}>Room {room.room_number} · {room.room_type_name} · {room.status}</option>)}
          </select>
          {roomId && <Input aria-label="Stay nights" type="number" min="1" max="90" value={stayNights} onChange={(event) => setStayNights(event.target.value)} placeholder="Number of nights" />}
          {roomId && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={activateStay} onChange={(event) => setActivateStay(event.target.checked)} /> Check guest in immediately</label>}
          <Input aria-label="CEO reference" placeholder="CEO reference (optional)" value={reference} onChange={(event) => setReference(event.target.value)} />
          <Textarea aria-label="Business reason" className="sm:col-span-2 lg:col-span-3" placeholder="Business reason" value={reason} onChange={(event) => setReason(event.target.value)} />
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Button className="w-full sm:w-auto" onClick={() => void createAuthorization()} disabled={saving || !guestName || !amount || !validUntil || !reason}>{saving ? "Creating..." : "Create authorization"}</Button>
          {message && <p className="text-sm text-muted-foreground" role="status">{message}</p>}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm font-semibold">Authorized exceptions</p>
          <Button type="button" variant="outline" size="sm" onClick={downloadAuthorizations} disabled={!items.length}>
            <Download className="mr-2 h-4 w-4" /> Download CSV
          </Button>
        </div>
        <div className="space-y-2">
          {items.length === 0 ? <p className="text-sm text-muted-foreground">No complimentary authorizations recorded.</p> : items.map((item) => (
            <div key={item.id} className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between">
              <div><p className="font-medium">{item.guest_name} · {item.scope}</p><p className="text-xs text-muted-foreground">{item.reason} · Expires {new Date(item.valid_until).toLocaleString()}</p><p className="text-xs text-muted-foreground">Used {formatCurrency(item.used_amount)} · Remaining {formatCurrency(item.remaining_amount || item.approved_amount)}</p></div>
              <div className="flex flex-wrap items-center gap-2"><span className="text-sm font-semibold">{formatCurrency(item.approved_amount)}</span><Badge variant={item.status === "active" ? "default" : "secondary"}>{item.status}</Badge><Button size="sm" variant="outline" onClick={() => void viewAuthorization(item.id)} disabled={detailLoading}><Eye className="mr-1 h-4 w-4" /> View</Button>{item.status === "active" && <Button size="sm" variant="outline" onClick={() => void revokeAuthorization(item.id)}>Revoke</Button>}</div>
            </div>
          ))}
        </div>
      </CardContent>
      <Dialog open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Complimentary authorization details</DialogTitle>
            <DialogDescription>Admin-only audit view for this authorized exception.</DialogDescription>
          </DialogHeader>
          {selected && <div className="space-y-4 text-sm">
            <div className="grid gap-3 sm:grid-cols-2"><div><p className="text-muted-foreground">Guest</p><p className="font-medium">{selected.guest_name}</p></div><div><p className="text-muted-foreground">Scope</p><p className="font-medium capitalize">{selected.scope}</p></div><div><p className="text-muted-foreground">Approved</p><p className="font-medium">{formatCurrency(selected.approved_amount)}</p></div><div><p className="text-muted-foreground">Used</p><p className="font-medium">{formatCurrency(selected.used_amount)}</p></div><div><p className="text-muted-foreground">Remaining</p><p className="font-medium">{formatCurrency(selected.remaining_amount)}</p></div><div><p className="text-muted-foreground">Status</p><Badge variant={selected.status === "active" ? "default" : "secondary"}>{selected.status}</Badge></div></div>
            <div><p className="text-muted-foreground">Business reason</p><p className="mt-1 leading-6">{selected.reason}</p></div>
            {(selected.room_id || selected.stay_nights) && <div className="rounded-md border bg-muted/30 p-3"><p className="font-medium">VIP stay controls</p><p className="text-muted-foreground">Room linked: {selected.room_id || "Booking pending"} · {selected.stay_nights || 0} night(s)</p><p className="text-muted-foreground">Room waiver: {selected.room_waived ? "Automatic" : "Not enabled"} · Folio waiver: {selected.folio_waived ? "Automatic" : "Not enabled"}</p></div>}
            <div className="grid gap-3 border-t pt-3 sm:grid-cols-2"><div><p className="text-muted-foreground">Valid until</p><p>{new Date(selected.valid_until).toLocaleString()}</p></div><div><p className="text-muted-foreground">Created</p><p>{new Date(selected.created_at).toLocaleString()}</p></div></div>
            <div><p className="mb-2 font-medium">Admin activity log</p>{selected.audit_log?.length ? <div className="space-y-2">{selected.audit_log.map((entry) => <div key={entry.id} className="rounded-md border p-2"><div className="flex justify-between gap-2"><span className="font-medium">{entry.action}</span><span className="text-xs text-muted-foreground">{new Date(entry.created_at).toLocaleString()}</span></div><p className="text-xs text-muted-foreground">{entry.details?.reason || entry.details?.roomId || "Activity recorded"}</p></div>)}</div> : <p className="text-muted-foreground">No audit activity recorded.</p>}</div>
            <div><p className="mb-2 font-medium">Usage history</p>{selected.usage?.length ? <div className="space-y-2">{selected.usage.map((usage) => <div key={usage.id} className="flex flex-col gap-1 rounded-md border p-2 sm:flex-row sm:items-center sm:justify-between"><span>{usage.transaction_type ? `${usage.transaction_type} · ` : ""}{usage.transaction_id || "Recorded usage"}</span><span className="font-medium">{formatCurrency(usage.amount_used)}</span></div>)}</div> : <p className="text-muted-foreground">No usage recorded.</p>}</div>
          </div>}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
