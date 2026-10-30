"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, ExternalLink, LockKeyhole } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Quote = { id: string; status: string; total: number; currency: string };
type EventBookingPanelProps = {
  eventId: string;
  secured: boolean;
  quoteApproved: boolean;
  selectedQuoteId?: string | null;
  receiptId?: string | null;
  onSecured: () => Promise<void>;
  onReviewQuote: () => void;
};

export function EventBookingPanel({
  eventId,
  secured,
  quoteApproved,
  selectedQuoteId,
  receiptId,
  onSecured,
  onReviewQuote,
}: EventBookingPanelProps) {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [quoteId, setQuoteId] = useState(selectedQuoteId ?? "");
  const [loading, setLoading] = useState(!secured);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (selectedQuoteId) {
      setQuoteId(selectedQuoteId);
    }
  }, [selectedQuoteId]);

  useEffect(() => {
    if (secured || !quoteApproved) {
      setLoading(false);
      return;
    }
    setLoading(true);
    void fetch(`/api/events/approved-quotes?eventId=${encodeURIComponent(eventId)}`, {
      cache: "no-store",
    })
      .then((response) => (response.ok ? response.json() : { quotes: [] }))
      .then((data) => {
        const list: Quote[] = data.quotes ?? [];
        setQuotes(list);
        if (!selectedQuoteId && list[0]?.id) {
          setQuoteId(list[0].id);
        }
      })
      .catch(() => setQuotes([]))
      .finally(() => setLoading(false));
  }, [eventId, secured, quoteApproved, selectedQuoteId]);

  async function secureBooking() {
    if (!quoteId) return;
    setSaving(true);
    setMessage("");
    const response = await fetch("/api/events/secure", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventId, quoteId }),
    });
    if (!response.ok) {
      setMessage((await response.json().catch(() => ({}))).error ?? "Unable to secure booking");
      setSaving(false);
      return;
    }
    const data = await response.json();
    setMessage("Venue and services secured. Receipt and financial records are ready.");
    await onSecured();
    setSaving(false);
    if (data.receiptId) {
      window.open(`/api/hotels/receipts/${data.receiptId}`, "_blank", "noopener,noreferrer");
    }
  }

  return (
    <Card
      id="event-booking-panel"
      className="border-emerald-200 bg-emerald-50/70 shadow-sm dark:border-emerald-900 dark:bg-emerald-950/30"
    >
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
            Step 2 · Booking &amp; Invoice Confirmation
          </p>
          <CardTitle className="mt-1">Secure venue and services</CardTitle>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            Confirm the approved quote for this event to lock the venue, generate the official receipt, and post the invoice to Finance.
          </p>
        </div>
        {secured ? (
          <Badge className="shrink-0 bg-emerald-600 text-white">
            <CheckCircle2 className="mr-1 size-3" />
            Secured
          </Badge>
        ) : (
          <LockKeyhole className="size-5 shrink-0 text-emerald-700" aria-hidden="true" />
        )}
      </CardHeader>
      <CardContent>
        {secured ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-background/70 p-4 dark:border-emerald-800">
            <div>
              <p className="font-medium">Booking is secured</p>
              <p className="text-sm text-muted-foreground">
                Receipt, invoice documents, and deposit collections are now active.
              </p>
            </div>
            {receiptId && (
              <Button asChild variant="outline" size="sm">
                <a
                  href={`/api/hotels/receipts/${receiptId}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <ExternalLink data-icon="inline-start" />
                  View receipt
                </a>
              </Button>
            )}
          </div>
        ) : !quoteApproved ? (
          <div className="rounded-2xl border border-border bg-background/70 p-4">
            <p className="font-medium">Approved quote required</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Build and approve a quotation above (or use &ldquo;Approve &amp; Secure Booking&rdquo;) to lock this venue.
            </p>
            <Button className="mt-3" size="sm" onClick={onReviewQuote}>
              Build or review quotes
            </Button>
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
            <label className="grid gap-2 text-sm font-medium">
              Approved quote ready to secure
              <select
                value={quoteId}
                onChange={(event) => setQuoteId(event.target.value)}
                disabled={loading || !quotes.length}
                className="h-10 rounded-xl border border-input bg-background px-3 font-normal"
              >
                <option value="">
                  {loading
                    ? "Loading approved quotes…"
                    : quotes.length
                      ? "Select approved quote"
                      : "No approved quote found"}
                </option>
                {quotes.map((quote) => (
                  <option key={quote.id} value={quote.id}>
                    Quote {quote.id.slice(0, 8).toUpperCase()} · {quote.currency}{" "}
                    {Number(quote.total).toFixed(2)}
                  </option>
                ))}
              </select>
            </label>
            <Button
              onClick={() => void secureBooking()}
              disabled={saving || !quoteId}
              className="bg-emerald-600 text-white hover:bg-emerald-700"
            >
              {saving ? "Securing…" : "Secure venue & generate invoice"}
            </Button>
          </div>
        )}
        {message && (
          <p className="mt-3 text-sm text-muted-foreground" role="status">
            {message}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export default EventBookingPanel;
