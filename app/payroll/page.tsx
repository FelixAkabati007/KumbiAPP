import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { RoleGuard } from "@/components/role-guard";
import { PayrollDesk } from "@/components/finance/payroll-desk";
import { Button } from "@/components/ui/button";
import { LogoDisplay } from "@/components/logo-display";

export default function PayrollPage() {
  return (
    <RoleGuard section="finance">
      <main className="min-h-screen bg-gradient-to-br from-orange-50 via-amber-50 to-yellow-100 text-foreground dark:from-orange-950 dark:via-amber-950 dark:to-yellow-950">
        <header className="sticky top-0 z-20 flex min-h-16 flex-wrap items-center justify-between gap-3 border-b border-orange-200 bg-white/80 px-3 py-3 backdrop-blur-md dark:border-orange-700 dark:bg-gray-900/80 sm:px-4 md:px-6">
          <div className="flex items-center gap-2 sm:gap-3">
            <Button asChild variant="outline" size="icon" className="rounded-xl border-orange-200 bg-white/80 dark:border-orange-700 dark:bg-gray-800/80" aria-label="Back to finance">
              <Link href="/finance"><ArrowLeft className="h-4 w-4 text-orange-600 dark:text-orange-400" aria-hidden="true" /></Link>
            </Button>
            <LogoDisplay size="sm" />
            <div>
              <p className="text-xs font-medium text-primary">Finance workspace</p>
              <h1 className="text-lg font-bold tracking-tight sm:text-2xl">Payroll &amp; compensation</h1>
            </div>
          </div>
        </header>
        <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
          <PayrollDesk />
        </div>
      </main>
    </RoleGuard>
  );
}
