"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

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
}

export function ComplimentaryAuthorizationsPanel() {
  const [items, setItems] = useState<Authorization[]>([]);
  const [guestName, setGuestName] = useState("");
  const [amount, setAmount] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [reason, setReason] = useState("");
  const [reference, setReference] = useState("");
  const [scope, setScope] = useState("both");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const response = await fetch("/api/admin/complimentary-authorizations");
    if (response.ok) setItems(await response.json());
  };

  useEffect(() => { void load(); }, []);

  const createAuthorization = async () => {
    setSaving(true);
    setMessage("");
    const response = await fetch("/api/admin/complimentary-authorizations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ guestName, scope, approvedAmount: amount, validUntil, reason, ceoReference: reference }),
    });
    const data = await response.json();
    if (!response.ok) setMessage(data.error || "Unable to create authorization");
    else {
      setGuestName(""); setAmount(""); setValidUntil(""); setReason(""); setReference("");
      setMessage("Authorization created and available for controlled application.");
      await load();
    }
    setSaving(false);
  };

  return (
    <Card className="border-emerald-200 bg-white/80">
      <CardHeader>
        <CardTitle className="text-emerald-900">VIP / Complimentary Exceptions</CardTitle>
        <p className="text-sm text-muted-foreground">Admin-created authorizations only. Frontdesk cannot create, edit, or extend these exceptions.</p>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Input aria-label="Guest name" placeholder="Guest name" value={guestName} onChange={(event) => setGuestName(event.target.value)} />
          <Input aria-label="Approved amount" type="number" min="0" placeholder="Approved amount" value={amount} onChange={(event) => setAmount(event.target.value)} />
          <Input aria-label="Valid until" type="datetime-local" value={validUntil} onChange={(event) => setValidUntil(event.target.value)} />
          <select aria-label="Scope" className="h-10 rounded-md border bg-background px-3 text-sm" value={scope} onChange={(event) => setScope(event.target.value)}>
            <option value="both">Hotel and restaurant</option><option value="hotel">Hotel</option><option value="restaurant">Restaurant</option>
          </select>
          <Input aria-label="CEO reference" placeholder="CEO reference (optional)" value={reference} onChange={(event) => setReference(event.target.value)} />
          <Textarea aria-label="Business reason" className="sm:col-span-2 lg:col-span-3" placeholder="Business reason" value={reason} onChange={(event) => setReason(event.target.value)} />
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Button onClick={() => void createAuthorization()} disabled={saving || !guestName || !amount || !validUntil || !reason}>{saving ? "Creating..." : "Create authorization"}</Button>
          {message && <p className="text-sm text-muted-foreground" role="status">{message}</p>}
        </div>
        <div className="space-y-2">
          {items.length === 0 ? <p className="text-sm text-muted-foreground">No complimentary authorizations recorded.</p> : items.map((item) => (
            <div key={item.id} className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between">
              <div><p className="font-medium">{item.guest_name} · {item.scope}</p><p className="text-xs text-muted-foreground">{item.reason} · Expires {new Date(item.valid_until).toLocaleString()}</p></div>
              <div className="flex items-center gap-2"><span className="text-sm font-semibold">₦{Number(item.approved_amount).toLocaleString()}</span><Badge variant={item.status === "active" ? "default" : "secondary"}>{item.status}</Badge></div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
