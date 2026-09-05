"use client";

import { useAuth } from "@/components/auth-provider";
import { NotificationBell } from "@/components/notification-bell";

export function GlobalNotificationHost() {
  const { user } = useAuth();
  if (!user) return null;

  return (
    <div className="pointer-events-none fixed right-3 top-3 z-[70] sm:right-4 sm:top-4">
      <div className="pointer-events-auto rounded-full border border-orange-200/80 bg-background/90 p-1 shadow-lg backdrop-blur-md dark:border-orange-800/80">
        <NotificationBell />
      </div>
    </div>
  );
}
