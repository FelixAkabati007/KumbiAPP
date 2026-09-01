"use client";

import useSWR from "swr";
import { Bell, CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface NotificationItem {
  id: string;
  title: string;
  message: string;
  type: string;
  read_at: string | null;
  created_at: string;
}

const fetcher = (url: string) => fetch(url).then((response) => {
  if (!response.ok) throw new Error("Unable to load notifications");
  return response.json();
});

export function NotificationBell() {
  const { data, mutate } = useSWR<{ notifications: NotificationItem[] }>(
    "/api/notifications",
    fetcher,
    { refreshInterval: 30000 },
  );
  const notifications = data?.notifications ?? [];
  const unreadCount = notifications.filter((item) => !item.read_at).length;

  async function markRead(id?: string) {
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(id ? { id } : { markAllRead: true }),
    });
    await mutate();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ""}`}>
          <Bell className="h-5 w-5" aria-hidden="true" />
          {unreadCount > 0 ? (
            <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[11px] font-semibold text-primary-foreground">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel className="flex items-center justify-between">
          <span>Notifications</span>
          {unreadCount > 0 ? (
            <button type="button" className="text-xs text-primary hover:underline" onClick={() => markRead()}>
              Mark all read
            </button>
          ) : null}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {notifications.length === 0 ? (
          <DropdownMenuItem disabled>No new notifications</DropdownMenuItem>
        ) : (
          notifications.slice(0, 8).map((item) => (
            <DropdownMenuItem key={item.id} className="items-start gap-3 py-3" onClick={() => !item.read_at && markRead(item.id)}>
              <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${item.read_at ? "bg-muted" : "bg-primary"}`} aria-hidden="true" />
              <span className="grid gap-1">
                <span className="font-medium">{item.title}</span>
                <span className="line-clamp-2 text-xs text-muted-foreground">{item.message}</span>
              </span>
            </DropdownMenuItem>
          ))
        )}
        {unreadCount === 0 && notifications.length > 0 ? (
          <div className="flex items-center gap-2 px-2 py-2 text-xs text-muted-foreground">
            <CheckCheck className="h-4 w-4" aria-hidden="true" /> All caught up
          </div>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
