"use client";

import { useAuth } from "@/components/auth-provider";
import { NotificationBell } from "@/components/notification-bell";

export function GlobalNotificationHost() {
  const { user } = useAuth();
  if (!user) return null;

  return (
    <div className="pointer-events-none fixed right-16 top-3 z-[45] sm:right-20 sm:top-4">
      <div className="pointer-events-auto rounded-full border border-orange-200/80 bg-background/95 p-1 shadow-md backdrop-blur-md dark:border-orange-800/80">
        <NotificationBell />
      </div>
    </div>
  );
}
