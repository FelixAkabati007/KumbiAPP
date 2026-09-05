"use client";

import { useAuth } from "@/components/auth-provider";
import { NotificationBell } from "@/components/notification-bell";

export function GlobalNotificationHost() {
  const { user } = useAuth();
  if (!user) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-16 z-[45] sm:top-20">
      <div className="mx-auto flex w-full max-w-screen-2xl justify-end px-3 sm:px-4 lg:px-6">
        <div className="pointer-events-auto rounded-full border border-orange-200/80 bg-background/95 p-1 shadow-md backdrop-blur-md dark:border-orange-800/80">
          <NotificationBell />
        </div>
      </div>
    </div>
  );
}
