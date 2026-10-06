"use client";

import { FormEvent, useState } from "react";
import { Plus, ReceiptText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type QuoteItem = { label: string; pricingUnit: string; quantity: string; unitPrice: string };
const blankItem: QuoteItem = { label: "Venue hire", pricingUnit: "fixed", quantity: "1", unitPrice: "" };

export function EventPricingDesk({ eventId, canEdit, onSaved }: { eventId: string; canEdit: boolean; onSaved?: () => void }) {
  const [items, setItems] = useState<QuoteItem[]>([blankItem]);
  const [discount, setDiscount] = useState("0");
  const [tax, setTax] = useState("0");
  const [deposit, setDeposit] = useState("50");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const subtotal = items.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.unitPrice || 0), 0);
  const total = Math.max(0, subtotal - Number(discount || 0) + Number(tax || 0));

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setMessage("");
    const response = await fetch("/api/events/quotes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ eventId, discountAmount: discount, taxAmount: tax, depositPercent: deposit, items }) });
    setMessage(response.ok ? "Draft quote saved. It is ready for review and approval." : ((await response.json()).error ?? "Unable to save quote"));
    setSaving(false); if (response.ok) onSaved?.();
  }

  return <Card id="event-pricing-desk" className="border-primary/30 bg-primary/5">
    <CardHeader><CardTitle className="flex items-center gap-2"><ReceiptText className="size-5 text-primary" />Pricing desk</CardTitle><p className="text-sm text-muted-foreground">Prepare this event&apos;s venue and services quote before approval.</p></CardHeader>
    <CardContent>{canEdit ? <form onSubmit={save} className="space-y-5"><div className="space-y-3"><div className="flex items-center justify-between"><h3 className="font-semibold">Quote items</h3><Button type="button" variant="outline" size="sm" onClick={() => setItems((current) => [...current, { label: "", pricingUnit: "fixed", quantity: "1", unitPrice: "" }])}><Plus data-icon="inline-start" />Add item</Button></div>{items.map((item, index) => <div key={index} className="grid gap-3 rounded-2xl border border-border bg-background/60 p-3 sm:grid-cols-[1.5fr_1fr_0.7fr_1fr]"><Input placeholder="Service, e.g. sound system" value={item.label} onChange={(e) => setItems((current) => current.map((row, i) => i === index ? { ...row, label: e.target.value } : row))} required /><select value={item.pricingUnit} onChange={(e) => setItems((current) => current.map((row, i) => i === index ? { ...row, pricingUnit: e.target.value } : row))} className="h-10 rounded-xl border border-input bg-background px-3"><option value="fixed">Fixed</option><option value="per_guest">Per guest</option><option value="per_hour">Per hour</option></select><Input type="number" min="0" step="0.01" placeholder="Qty" value={item.quantity} onChange={(e) => setItems((current) => current.map((row, i) => i === index ? { ...row, quantity: e.target.value } : row))} required /><Input type="number" min="0" step="0.01" placeholder="Unit price" value={item.unitPrice} onChange={(e) => setItems((current) => current.map((row, i) => i === index ? { ...row, unitPrice: e.target.value } : row))} required /></div>)}</div><div className="grid gap-3 sm:grid-cols-3"><Input type="number" min="0" step="0.01" placeholder="Discount" value={discount} onChange={(e) => setDiscount(e.target.value)} /><Input type="number" min="0" step="0.01" placeholder="Tax" value={tax} onChange={(e) => setTax(e.target.value)} /><Input type="number" min="0" max="100" step="1" placeholder="Deposit %" value={deposit} onChange={(e) => setDeposit(e.target.value)} /></div><div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-background/70 p-4"><div className="text-sm text-muted-foreground">Subtotal <strong className="ml-2 text-foreground">GHS {subtotal.toFixed(2)}</strong><span className="mx-2">·</span>Total <strong className="ml-2 text-foreground">GHS {total.toFixed(2)}</strong></div><Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save draft quote"}</Button></div>{message && <p className="text-sm text-muted-foreground" role="status">{message}</p>}</form> : <p className="text-sm text-muted-foreground">Pricing is view-only for your role. Review quote versions below.</p>}</CardContent>
  </Card>;
}
