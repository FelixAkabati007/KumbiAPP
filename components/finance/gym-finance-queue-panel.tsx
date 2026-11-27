"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Dumbbell, ExternalLink, RefreshCw, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

interface PendingGymPayment {
  id: string;
  payment_reference: string;
  amount: number | string;
  method: string;
  status: string;
  verification_status: string;
  recorded_at: string;
  first_name: string;
  last_name: string;
  booking_number: string | null;
  membership_number: string | null;
}

interface PendingGymRefund {
  id: string;
  refund_number: string;
  amount: number | string;
  reason: string;
  status: string;
  payment_reference: string;
  first_name: string;
  last_name: string;
}

export function GymFinanceQueuePanel({ onUpdated }: { onUpdated?: () => void }) {
  const { toast } = useToast();
  const [payments, setPayments] = useState<PendingGymPayment[]>([]);
  const [refunds, setRefunds] = useState<PendingGymRefund[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadQueue = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [payRes, refRes] = await Promise.all([
        fetch("/api/gym/payments", { cache: "no-store" }),
        fetch("/api/gym/refunds?status=pending_finance_approval", { cache: "no-store" }),
      ]);
      if (payRes.ok) {
        const d = await payRes.json();
        const all: PendingGymPayment[] = d.payments ?? [];
        setPayments(
          all.filter(
            (p) =>
              p.verification_status === "pending_verification" ||
              p.verification_status === "pending_reconciliation",
          ),
        );
      }
      if (refRes.ok) {
        const d = await refRes.json();
        setRefunds(d.refunds ?? []);
      }
    } catch {
      // Non-fatal in background poll
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadQueue(false);
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void loadQueue(true);
    }, 20000);
    return () => window.clearInterval(timer);
  }, [loadQueue]);

  async function handlePaymentAction(
    id: string,
    action: "approve_and_post" | "reconcile" | "reject",
  ) {
    if (busyId) return;
    setBusyId(id);
    try {
      const res = await fetch("/api/gym/payments", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentId: id, action }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Finance review failed");
      toast({
        title:
          action === "approve_and_post"
            ? "Gym Payment Verified & Posted"
            : action === "reconcile"
              ? "Gym Payment Reconciled"
              : "Gym Payment Rejected",
        description: `${data.payment?.payment_reference ?? "Transaction"} updated in canonical ledger.`,
      });
      await loadQueue(true);
      onUpdated?.();
    } catch (err) {
      toast({
        title: "Action Failed",
        description: err instanceof Error ? err.message : "Unable to update payment",
        variant: "destructive",
      });
    } finally {
      setBusyId(null);
    }
  }

  async function handleRefundAction(id: string, action: "approve" | "reject") {
    if (busyId) return;
    setBusyId(id);
    try {
      const res = await fetch("/api/gym/refunds", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refundId: id, action }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Refund decision failed");
      toast({
        title: action === "approve" ? "Gym Refund Approved & Reversed" : "Gym Refund Rejected",
        description: `${data.refund?.refund_number ?? "Refund"} processed.`,
      });
      await loadQueue(true);
      onUpdated?.();
    } catch (err) {
      toast({
        title: "Refund Action Failed",
        description: err instanceof Error ? err.message : "Unable to process refund",
        variant: "destructive",
      });
    } finally {
      setBusyId(null);
    }
  }

  const pendingTotal = payments.length + refunds.length;

  return (
    <Card>
      <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <Dumbbell className="h-4 w-4 text-primary" />
            Gym &amp; Fitness Settlements &amp; Refund Approvals
            {pendingTotal > 0 && (
              <Badge className="bg-orange-600 text-white">{pendingTotal} pending</Badge>
            )}
          </CardTitle>
          <CardDescription>
            Verify bank transfers, reconcile desk Gym collections, and approve Gym refund reversals.
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => void loadQueue(false)}
            disabled={loading}
          >
            <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Sync
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/gym">
              Open Gym Desk
              <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading Gym Finance queue...</p>
        ) : pendingTotal === 0 ? (
          <div className="flex items-center gap-2 rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            All Gym &amp; Fitness payments and refund requests are reconciled.
          </div>
        ) : (
          <div className="space-y-3">
            {payments.map((p) => (
              <div
                key={p.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 text-sm"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-semibold">{p.payment_reference}</span>
                    <Badge variant="outline" className="capitalize text-xs">
                      {p.verification_status.replaceAll("_", " ")}
                    </Badge>
                    <span className="text-xs capitalize text-muted-foreground">
                      via {p.method.replaceAll("_", " ")}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {p.first_name} {p.last_name} · {p.booking_number || p.membership_number || "Gym"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold">GHS {Number(p.amount).toFixed(2)}</span>
                  {p.verification_status === "pending_verification" ? (
                    <>
                      <Button
                        size="sm"
                        disabled={busyId === p.id}
                        onClick={() => void handlePaymentAction(p.id, "approve_and_post")}
                      >
                        <ShieldCheck className="mr-1 h-3.5 w-3.5" />
                        Verify &amp; Post
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busyId === p.id}
                        onClick={() => void handlePaymentAction(p.id, "reject")}
                      >
                        Reject
                      </Button>
                    </>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busyId === p.id}
                      onClick={() => void handlePaymentAction(p.id, "reconcile")}
                    >
                      Mark Reconciled
                    </Button>
                  )}
                </div>
              </div>
            ))}

            {refunds.map((r) => (
              <div
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-300/80 bg-amber-50/40 p-3 text-sm dark:border-amber-800 dark:bg-amber-950/20"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-semibold">{r.refund_number}</span>
                    <Badge variant="secondary" className="text-xs">
                      Refund Approval Needed
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {r.first_name} {r.last_name} · Payment {r.payment_reference} · {r.reason}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-destructive">
                    GHS {Number(r.amount).toFixed(2)}
                  </span>
                  <Button
                    size="sm"
                    disabled={busyId === r.id}
                    onClick={() => void handleRefundAction(r.id, "approve")}
                  >
                    Approve Refund
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busyId === r.id}
                    onClick={() => void handleRefundAction(r.id, "reject")}
                  >
                    Reject
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
