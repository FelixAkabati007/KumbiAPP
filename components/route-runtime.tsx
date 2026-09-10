"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { InstallAppPrompt } from "@/components/install-app-prompt";
import { RealtimeProvider } from "@/components/realtime-provider";
import { SystemSyncListener } from "@/components/system-sync-listener";

const AUTH_ROUTES = ["/login", "/signup", "/forgot-password", "/reset-password", "/auth"];

function isAuthRoute(pathname: string) {
  return AUTH_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}

export function RouteRuntime({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const lightweight = isAuthRoute(pathname);

  if (lightweight) return <>{children}</>;

  return (
    <RealtimeProvider>
      <SystemSyncListener />
      {children}
      <InstallAppPrompt />
    </RealtimeProvider>
  );
}
