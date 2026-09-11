"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Award, ArrowUpRight, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type PerformanceResponse = {
  summary?: { staff_count: number; total_points: string; event_count: number };
  staff?: Array<{ staff_id: string; staff_name: string; department: string; points: string }>;
};

export function StaffRewardsPanel() {
  const [data, setData] = useState<PerformanceResponse | null>(null);

  useEffect(() => {
    const from = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
    const to = new Date().toISOString().slice(0, 10);
    fetch(`/api/performance?from=${from}&to=${to}`, { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((result) => result && setData(result))
      .catch(() => undefined);
  }, []);

  const summary = data?.summary;
  const topStaff = [...(data?.staff ?? [])].sort((a, b) => Number(b.points) - Number(a.points)).slice(0, 3);

  return (
    <Card className="border-primary/20 bg-primary/[0.03]">
      <CardHeader className="flex flex-col gap-3 pb-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Award className="h-5 w-5 text-primary" aria-hidden="true" />
            <CardTitle>Staff Points &amp; Rewards</CardTitle>
          </div>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">Monitor this month&apos;s incentive activity before approving any payroll reward.</p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/performance">Open performance dashboard <ArrowUpRight className="ml-2 h-4 w-4" aria-hidden="true" /></Link>
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border bg-background p-3"><p className="text-xs uppercase tracking-wide text-muted-foreground">Staff measured</p><p className="mt-1 text-xl font-semibold">{summary?.staff_count ?? 0}</p></div>
          <div className="rounded-lg border bg-background p-3"><p className="text-xs uppercase tracking-wide text-muted-foreground">Points this month</p><p className="mt-1 text-xl font-semibold">{Number(summary?.total_points ?? 0).toLocaleString()}</p></div>
          <div className="rounded-lg border bg-background p-3"><p className="text-xs uppercase tracking-wide text-muted-foreground">Ledger events</p><p className="mt-1 text-xl font-semibold">{summary?.event_count ?? 0}</p></div>
        </div>
        {topStaff.length > 0 ? <div className="divide-y rounded-lg border bg-background">{topStaff.map((member, index) => <div className="flex items-center justify-between gap-3 p-3" key={member.staff_id}><div className="flex min-w-0 items-center gap-3"><div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">{index + 1}</div><div className="min-w-0"><p className="truncate text-sm font-medium">{member.staff_name}</p><p className="truncate text-xs text-muted-foreground">{member.department}</p></div></div><Badge variant={Number(member.points) >= 0 ? "default" : "destructive"}>{Number(member.points).toLocaleString()} pts</Badge></div>)}</div> : <div className="flex items-center gap-2 rounded-lg border border-dashed p-4 text-sm text-muted-foreground"><Users className="h-4 w-4" aria-hidden="true" />No verified points recorded this month.</div>}
        <p className="text-xs leading-relaxed text-muted-foreground">Points remain operational performance data. Convert them to a monetary reward only after management approval and payroll review.</p>
      </CardContent>
    </Card>
  );
}
