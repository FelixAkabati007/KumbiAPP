"use client";

import { FormEvent, useState } from "react";
import { CheckCircle2, Plus, ReceiptText, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type QuoteItem = {
  label: string;
  pricingUnit: string;
  quantity: string;
  unitPrice: string;
};

const blankItem: QuoteItem = {
  label: "Venue hire",
  pricingUnit: "fixed",
  quantity: "1",
  unitPrice: "",
};

const QUICK_PRESETS: Array<{ label: string; pricingUnit: string; defaultPrice: string }> = [
  { label: "Conference / Banquet Hall Hire", pricingUnit: "fixed", defaultPrice: "1500" },
  { label: "Buffet Catering Package", pricingUnit: "per_guest", defaultPrice: "85" },
  { label: "Drinks & Refreshments", pricingUnit: "per_guest", defaultPrice: "35" },
  { label: "PA & Sound System", pricingUnit: "fixed", defaultPrice: "500" },
  { label: "Stage & Hall Decoration", pricingUnit: "fixed", defaultPrice: "800" },
  { label: "Event Waiters / Ushers", pricingUnit: "per_staff", defaultPrice: "150" },
];

export function EventPricingDesk({
  eventId,
  canEdit,
  guestCount = 1,
  secured = false,
  onSaved,
  onQuoteSecured,
}: {
  eventId: string;
  canEdit: boolean;
  guestCount?: number;
  secured?: boolean;
  onSaved?: () => void;
  onQuoteSecured?: () => Promise<void> | void;
}) {
  const [items, setItems] = useState<QuoteItem[]>([blankItem]);
  const [discount, setDiscount] = useState("0");
  const [tax, setTax] = useState("0");
  const [deposit, setDeposit] = useState("50");
  const [saving, setSaving] = useState(false);
  const [fastTracking, setFastTracking] = useState(false);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);

  const subtotal = items.reduce(
    (sum, item) => sum + Number(item.quantity || 0) * Number(item.unitPrice || 0),
    0,
  );
  const total = Math.max(0, subtotal - Number(discount || 0) + Number(tax || 0));
  const depositAmount = (total * Math.min(100, Math.max(0, Number(deposit || 0)))) / 100;

  function addPreset(preset: (typeof QUICK_PRESETS)[number]) {
    const qty = preset.pricingUnit === "per_guest" ? String(Math.max(1, guestCount)) : "1";
    setItems((current) => {
      if (current.length === 1 && !current[0].unitPrice && current[0].label === "Venue hire") {
        return [
          {
            label: preset.label,
            pricingUnit: preset.pricingUnit,
            quantity: qty,
            unitPrice: preset.defaultPrice,
          },
        ];
      }
      return [
        ...current,
        {
          label: preset.label,
          pricingUnit: preset.pricingUnit,
          quantity: qty,
          unitPrice: preset.defaultPrice,
        },
      ];
    });
  }

  async function submitQuote(autoApproveAndSecure: boolean) {
    setIsError(false);
    setMessage("");
    if (autoApproveAndSecure) setFastTracking(true);
    else setSaving(true);

    try {
      const response = await fetch("/api/events/quotes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId,
          discountAmount: discount,
          taxAmount: tax,
          depositPercent: deposit,
          autoApprove: autoApproveAndSecure,
          items,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setIsError(true);
        setMessage(payload.error ?? "Unable to save quote");
        return;
      }

      if (autoApproveAndSecure && payload.quote?.id && !secured) {
        const secureRes = await fetch("/api/events/secure", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ eventId, quoteId: payload.quote.id }),
        });
        if (secureRes.ok) {
          setMessage(
            "Quote approved and venue booking secured! Invoice & receipt have been generated.",
          );
          onSaved?.();
          await onQuoteSecured?.();
          return;
        }
      }

      setMessage(
        autoApproveAndSecure
          ? "Quote saved and approved."
          : "Draft quote saved. You can approve it below or submit for review.",
      );
      onSaved?.();
    } finally {
      setSaving(false);
      setFastTracking(false);
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await submitQuote(false);
  }

  return (
    <Card id="event-pricing-desk" className="border-primary/30 bg-primary/5">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2">
            <ReceiptText className="size-5 text-primary" />
            Step 1 · Event Quote &amp; Package Builder
          </CardTitle>
          {guestCount > 0 && (
            <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
              Guest count: {guestCount}
            </span>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          Add venue hire, catering, and equipment packages. Choosing &ldquo;Per guest&rdquo; automatically multiplies by the event&apos;s guest count ({guestCount}).
        </p>
      </CardHeader>
      <CardContent>
        {canEdit ? (
          <form onSubmit={save} className="space-y-5">
            <div className="space-y-2">
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <Sparkles className="size-3.5 text-primary" />
                Quick-add service presets
              </p>
              <div className="flex flex-wrap gap-1.5">
                {QUICK_PRESETS.map((preset) => (
                  <Button
                    key={preset.label}
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 rounded-full text-xs"
                    onClick={() => addPreset(preset)}
                  >
                    + {preset.label}
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">Quote line items</h3>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setItems((current) => [
                      ...current,
                      { label: "", pricingUnit: "fixed", quantity: "1", unitPrice: "" },
                    ])
                  }
                >
                  <Plus data-icon="inline-start" />
                  Add custom item
                </Button>
              </div>
              {items.map((item, index) => (
                <div
                  key={index}
                  className="grid gap-3 rounded-2xl border border-border bg-background/80 p-3 sm:grid-cols-[1.5fr_1fr_0.7fr_1fr_auto] sm:items-center"
                >
                  <Input
                    placeholder="Service, e.g. Sound system"
                    value={item.label}
                    onChange={(e) =>
                      setItems((current) =>
                        current.map((row, i) =>
                          i === index ? { ...row, label: e.target.value } : row,
                        ),
                      )
                    }
                    required
                  />
                  <select
                    value={item.pricingUnit}
                    onChange={(e) => {
                      const nextUnit = e.target.value;
                      setItems((current) =>
                        current.map((row, i) =>
                          i === index
                            ? {
                                ...row,
                                pricingUnit: nextUnit,
                                quantity:
                                  nextUnit === "per_guest"
                                    ? String(Math.max(1, guestCount))
                                    : row.quantity,
                              }
                            : row,
                        ),
                      );
                    }}
                    className="h-10 rounded-xl border border-input bg-background px-3 text-sm"
                  >
                    <option value="fixed">Fixed fee</option>
                    <option value="per_guest">Per guest ({guestCount})</option>
                    <option value="per_hour">Per hour</option>
                    <option value="per_staff">Per staff</option>
                  </select>
                  <Input
                    type="number"
                    min="0.01"
                    step="0.01"
                    placeholder="Qty"
                    value={item.quantity}
                    onChange={(e) =>
                      setItems((current) =>
                        current.map((row, i) =>
                          i === index ? { ...row, quantity: e.target.value } : row,
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
                    onChange={(e) =>
                      setItems((current) =>
                        current.map((row, i) =>
                          i === index ? { ...row, unitPrice: e.target.value } : row,
                        ),
                      )
                    }
                    required
                  />
                  {items.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="Remove line item"
                      onClick={() =>
                        setItems((current) => current.filter((_, i) => i !== index))
                      }
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
                Discount (GHS)
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={discount}
                  onChange={(e) => setDiscount(e.target.value)}
                />
              </label>
              <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
                VAT / Tax (GHS)
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={tax}
                  onChange={(e) => setTax(e.target.value)}
                />
              </label>
              <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
                Required Deposit (%)
                <Input
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                  placeholder="50"
                  value={deposit}
                  onChange={(e) => setDeposit(e.target.value)}
                />
              </label>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-background/80 p-4">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                <span>
                  Subtotal{" "}
                  <strong className="ml-1 text-foreground">
                    GHS {subtotal.toFixed(2)}
                  </strong>
                </span>
                <span>·</span>
                <span>
                  Total{" "}
                  <strong className="ml-1 text-foreground">
                    GHS {total.toFixed(2)}
                  </strong>
                </span>
                <span>·</span>
                <span>
                  Deposit ({deposit}%){" "}
                  <strong className="ml-1 text-emerald-700 dark:text-emerald-400">
                    GHS {depositAmount.toFixed(2)}
                  </strong>
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="submit"
                  variant="outline"
                  disabled={saving || fastTracking}
                >
                  {saving ? "Saving…" : "Save draft quote"}
                </Button>
                <Button
                  type="button"
                  disabled={saving || fastTracking}
                  onClick={() => void submitQuote(true)}
                  className="bg-emerald-600 text-white hover:bg-emerald-700"
                >
                  <CheckCircle2 className="mr-1.5 size-4" />
                  {fastTracking
                    ? "Approving & securing…"
                    : secured
                      ? "Save & Approve Quote"
                      : "Approve & Secure Booking Now"}
                </Button>
              </div>
            </div>
            {message && (
              <p
                className={`text-sm font-medium ${
                  isError ? "text-destructive" : "text-emerald-700 dark:text-emerald-400"
                }`}
                role="status"
              >
                {message}
              </p>
            )}
          </form>
        ) : (
          <p className="text-sm text-muted-foreground">
            Pricing is view-only for your role. Review quote versions below.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
