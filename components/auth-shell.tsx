import type { ReactNode } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LogoDisplay } from "@/components/logo-display";

export function AuthShell({ title, description, children, footer }: { title: string; description: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <main className="flex min-h-[100dvh] items-start justify-center overflow-y-auto bg-gradient-to-br from-orange-50 via-amber-50 to-yellow-100 px-3 py-5 text-foreground dark:from-orange-950 dark:via-amber-950 dark:to-yellow-950 sm:items-center sm:p-6">
      <div className="w-full max-w-md space-y-4 sm:space-y-6">
        <header className="space-y-2 text-center">
          <div className="flex justify-center"><LogoDisplay size="md" /></div>
          <h1 className="text-xl font-bold text-gray-800 dark:text-gray-200 sm:text-2xl">Kumbisaly Heritage Restaurant</h1>
          <p className="text-sm text-gray-600 dark:text-gray-400">Point of Sale System</p>
        </header>
        <Card className="relative overflow-hidden rounded-3xl border border-orange-200 bg-white/70 shadow-sm backdrop-blur-sm dark:border-orange-700 dark:bg-gray-800/70">
          <div className="absolute inset-0 bg-gradient-to-br from-orange-100/20 via-amber-100/20 to-yellow-100/20 dark:from-orange-900/20 dark:via-amber-900/20 dark:to-yellow-900/20" />
          <CardHeader className="relative z-10 rounded-t-3xl bg-gradient-to-r from-orange-500/10 via-amber-500/10 to-yellow-500/10 text-center dark:from-orange-400/10 dark:via-amber-400/10 dark:to-yellow-400/10">
            <CardTitle className="text-lg text-gray-800 dark:text-gray-200 sm:text-xl">{title}</CardTitle>
            <CardDescription className="text-sm text-gray-600 dark:text-gray-400">{description}</CardDescription>
          </CardHeader>
          <CardContent className="relative z-10 p-4 sm:p-6">{children}</CardContent>
        </Card>
        {footer}
      </div>
    </main>
  );
}

export function AuthSpinner({ label }: { label: string }) {
  return <span className="flex items-center justify-center gap-2"><span aria-hidden="true" className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />{label}</span>;
}
