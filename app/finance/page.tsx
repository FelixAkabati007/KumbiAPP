"use client";

import { useEffect, useMemo, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { RoleGuard } from "@/components/role-guard";
import Link from "next/link";
import { ArrowLeft, CreditCard, Download, RefreshCw, TrendingUp } from "lucide-react";
import { PayrollDesk } from "@/components/finance/payroll-desk";

type Transaction = {
  transaction_id?: string;
  amount: number | string;
  status: string;
  payment_method?: string;
  created_at: string;
};

export default function FinancePage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [source, setSource] = useState("all");
  const [loading, setLoading] = useState(true);
  const [authority, setAuthority] = useState<{ actingAuthority: boolean; authorityLabel: string } | null>(null);

  useEffect(() => {
    fetch("/api/finance/access", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => data && setAuthority(data))
      .catch(() => undefined);
  }, []);

  const loadTransactions = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/transactions?limit=1000${source !== "all" ? `&source=${source}` : ""}`, { cache: "no-store" });
      if (response.ok) {
        const data = await response.json();
        setTransactions(Array.isArray(data) ? data : data.transactions ?? []);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadTransactions();
  }, [source]);

  const totals = useMemo(() => {
    const completed = transactions.filter((item) => ["completed", "succeeded", "success"].includes(item.status.toLowerCase()));
    return {
      gross: completed.reduce((sum, item) => sum + Number(item.amount || 0), 0),
      count: completed.length,
      refunds: transactions.filter((item) => item.status === "refunded").length,
    };
  }, [transactions]);

  const exportCsv = () => {
    const rows = [
      ["Transaction", "Amount", "Status", "Payment Method", "Created"],
      ...transactions.map((item) => [
        item.transaction_id ?? "",
        String(item.amount),
        item.status,
        item.payment_method ?? "",
        item.created_at,
      ]),
    ];
    const blob = new Blob([rows.map((row) => row.map((value) => `"${value.replaceAll('"', '""')}"`).join(",")).join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `finance-transactions-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <RoleGuard section="finance">
      <main className="min-h-screen bg-muted/30 p-4 sm:p-6 lg:p-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-6">
          <header className="flex flex-col gap-4 rounded-xl border bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-6">
            <div className="flex items-start gap-3">
              <Button asChild variant="outline" size="icon" className="shrink-0 rounded-2xl" aria-label="Back to dashboard">
                <Link href="/"><ArrowLeft className="h-4 w-4" aria-hidden="true" /></Link>
              </Button>
              <div>
              <p className="text-sm font-medium text-primary">Finance workspace</p>
              <h1 className="text-3xl font-bold tracking-tight text-balance">Reconciliation and cash flow</h1>
              <p className="mt-1 text-sm text-muted-foreground">Review completed transactions, refunds, and payment activity.</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Select value={source} onValueChange={setSource}>
                <SelectTrigger className="w-[150px]" aria-label="Transaction source"><SelectValue placeholder="All sources" /></SelectTrigger>
                <SelectContent><SelectItem value="all">All sources</SelectItem><SelectItem value="hotel">Hotel activity</SelectItem><SelectItem value="restaurant">Restaurant sales</SelectItem></SelectContent>
              </Select>
              <Button variant="outline" onClick={() => void loadTransactions()} disabled={loading} aria-label="Refresh finance transactions">
                <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" /> Refresh
              </Button>
              <Button onClick={exportCsv} disabled={!transactions.length}>
                <Download className="mr-2 h-4 w-4" aria-hidden="true" /> Export CSV
              </Button>
            </div>
          </header>
          {authority?.actingAuthority && (
            <Alert className="border-amber-300 bg-amber-50 text-amber-950">
              <AlertTitle>Acting Finance Authority</AlertTitle>
              <AlertDescription>No active Finance Manager is assigned. As General Manager, you temporarily have operational Finance access until a Finance Manager is appointed or reactivated. All actions are audited.</AlertDescription>
            </Alert>
          )}
          <PayrollDesk />
          <section className="grid gap-4 sm:grid-cols-3" aria-label="Finance summary">
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Completed gross</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold">GHS {totals.gross.toFixed(2)}</p></CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Settled payments</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold">{totals.count}</p></CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Refund records</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold">{totals.refunds}</p></CardContent></Card>
          </section>
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><CreditCard className="h-5 w-5 text-primary" aria-hidden="true" /> Recent transactions</CardTitle></CardHeader>
            <CardContent>
              {loading ? <p className="text-sm text-muted-foreground">Loading transactions...</p> : transactions.length === 0 ? <p className="text-sm text-muted-foreground">No transactions found.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-sm"><thead><tr className="border-b text-left"><th className="p-3">Transaction</th><th className="p-3">Amount</th><th className="p-3">Status</th><th className="p-3">Method</th><th className="p-3">Created</th></tr></thead><tbody>{transactions.slice(0, 100).map((item, index) => <tr className="border-b last:border-0" key={item.transaction_id ?? `${item.created_at}-${index}`}><td className="p-3 font-medium">{item.transaction_id ?? "—"}</td><td className="p-3">GHS {Number(item.amount || 0).toFixed(2)}</td><td className="p-3 capitalize">{item.status}</td><td className="p-3 capitalize">{item.payment_method ?? "—"}</td><td className="p-3">{new Date(item.created_at).toLocaleString()}</td></tr>)}</tbody></table></div>}
            </CardContent>
          </Card>
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><TrendingUp className="h-4 w-4" aria-hidden="true" /> Finance access is limited to authorized roles.</div>
        </div>
      </main>
    </RoleGuard>
  );
}
