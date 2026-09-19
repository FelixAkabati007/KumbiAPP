import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { RoleGuard } from "@/components/role-guard";
import { PayrollDesk } from "@/components/finance/payroll-desk";
import { Button } from "@/components/ui/button";

export default function PayrollPage() {
  return (
    <RoleGuard section="finance">
      <main className="min-h-screen bg-background px-4 py-6 text-foreground sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-6">
          <header className="flex flex-col gap-4 rounded-lg border bg-card p-4 md:flex-row md:items-center md:justify-between md:p-6">
            <div className="flex items-start gap-3">
              <Button asChild variant="outline" size="icon" aria-label="Back to finance">
                <Link href="/finance"><ArrowLeft className="h-4 w-4" aria-hidden="true" /></Link>
              </Button>
              <div>
                <p className="text-sm font-medium text-primary">Finance workspace</p>
                <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Payroll &amp; compensation</h1>
                <p className="mt-1 text-sm text-muted-foreground">Manage recurring compensation profiles, prepare payroll, and review approval status.</p>
              </div>
            </div>
          </header>
          <PayrollDesk />
        </div>
      </main>
    </RoleGuard>
  );
}
