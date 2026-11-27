"use client";

import { useEffect, useMemo, useRef } from "react";
import useSWR from "swr";
import { useAuth } from "@/components/auth-provider";
import { useRealtime } from "@/components/realtime-provider";
import { useToast } from "@/hooks/use-toast";
import {
  ensureDevicePushSubscription,
  playNotificationSound,
  syncAppIconBadge,
} from "@/lib/notifications";

interface NotificationItem {
  id: string;
  title: string;
  message: string;
  type: string;
  read_at: string | null;
  opened_at: string | null;
  created_at: string;
}

interface NotificationsResponse {
  notifications: NotificationItem[];
  unreadCount?: number;
}

const fetcher = async (url: string): Promise<NotificationsResponse> => {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch notifications");
  return res.json();
};

function hasAlertedInSessionStorage(id: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.sessionStorage?.getItem(`kumbi_alerted_notif_${id}`) === "1";
  } catch {
    return false;
  }
}

function markAlertedInSessionStorage(id: string): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage?.setItem(`kumbi_alerted_notif_${id}`, "1");
  } catch {
    // ignore
  }
}

export function GlobalNotificationSync() {
  const { user } = useAuth();
  const { lastEvent } = useRealtime();
  const { toast } = useToast();

  const { data, mutate } = useSWR<NotificationsResponse>(
    user ? "/api/notifications" : null,
    fetcher,
    {
      refreshInterval: 15000,
      revalidateOnFocus: true,
      revalidateOnReconnect: true,
      shouldRetryOnError: true,
    }
  );

  const notifications = useMemo(() => data?.notifications ?? [], [data?.notifications]);
  const unreadCount = useMemo(() => {
    if (typeof data?.unreadCount === "number") return data.unreadCount;
    return notifications.filter((n) => !n.read_at).length;
  }, [data?.unreadCount, notifications]);

  const seenNotificationIds = useRef<Set<string>>(new Set());
  const initialLoadDone = useRef(false);

  // Sync OS and browser App Icon Badge whenever unreadCount updates
  useEffect(() => {
    if (!user) {
      void syncAppIconBadge(0);
      return;
    }
    void syncAppIconBadge(unreadCount);
  }, [user, unreadCount]);

  // Periodic shift-reminder heartbeat for authenticated workforce & property sessions
  useEffect(() => {
    if (typeof window === "undefined" || !user) return;

    const triggerReminderCheck = () => {
      if (!navigator.onLine) return;
      fetch("/api/workforce/reminders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((payload) => {
          if (payload && Number(payload.created) > 0) {
            void mutate();
          }
        })
        .catch(() => undefined);
    };

    const initialTimer = setTimeout(triggerReminderCheck, 1500);
    const interval = setInterval(triggerReminderCheck, 45_000);

    return () => {
      clearTimeout(initialTimer);
      clearInterval(interval);
    };
  }, [user, mutate]);

  // Revalidate notifications whenever realtime SSE broadcasts "notifications.updated"
  useEffect(() => {
    if (!lastEvent || !user) return;
    if (lastEvent.topic === "notifications.updated") {
      void mutate();
    }
  }, [lastEvent, user, mutate]);

  // Listen for Service Worker push events posted to window
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    const handleSwMessage = (event: MessageEvent) => {
      if (event.data && event.data.type === "KUMBI_PUSH_EVENT") {
        void mutate();
      }
    };

    navigator.serviceWorker.addEventListener("message", handleSwMessage);
    return () => {
      navigator.serviceWorker.removeEventListener("message", handleSwMessage);
    };
  }, [mutate]);

  // Handle incoming notifications (alerts, chime, toasts)
  useEffect(() => {
    if (!user || notifications.length === 0) return;

    if (!initialLoadDone.current) {
      const nowMs = Date.now();
      notifications.forEach((item) => {
        seenNotificationIds.current.add(item.id);
        // Surface fresh unread 20-minute shift reminders even on initial page load
        const createdMs = Date.parse(item.created_at);
        const isFreshShiftReminder =
          !item.read_at &&
          item.type === "shift_reminder" &&
          Number.isFinite(createdMs) &&
          Math.abs(nowMs - createdMs) <= 30 * 60 * 1000 &&
          !hasAlertedInSessionStorage(item.id);

        if (isFreshShiftReminder) {
          markAlertedInSessionStorage(item.id);
          playNotificationSound();
          toast({
            title: item.title,
            description: item.message,
          });
        }
      });
      initialLoadDone.current = true;
      return;
    }

    const unreadNew = notifications.filter(
      (item) =>
        !item.read_at &&
        !seenNotificationIds.current.has(item.id) &&
        !hasAlertedInSessionStorage(item.id)
    );

    if (unreadNew.length > 0) {
      unreadNew.forEach((item) => {
        seenNotificationIds.current.add(item.id);
        markAlertedInSessionStorage(item.id);
      });

      playNotificationSound();

      unreadNew.forEach((item) => {
        const isCheckInOut =
          item.type === "attendance_check_in" || item.type === "attendance_check_out";
        toast({
          title: item.title,
          description: item.message,
          variant: isCheckInOut ? "default" : undefined,
        });

        if (
          typeof window !== "undefined" &&
          document.visibilityState === "hidden" &&
          "Notification" in window &&
          Notification.permission === "granted"
        ) {
          try {
            new Notification(item.title, {
              body: item.message,
              icon: "/favicon.ico?size=192",
              badge: "/favicon.ico?size=192",
              tag: item.id,
            });
          } catch {
            // ignore
          }
        }
      });
    }
  }, [notifications, user, toast]);

  // Attempt automatic device push registration if permission already granted
  useEffect(() => {
    if (!user) return;
    if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
      void ensureDevicePushSubscription();
    }
  }, [user]);

  // Keep badge synchronized on window focus or reconnection
  useEffect(() => {
    if (typeof window === "undefined" || !user) return;

    const handleVisibilityOrOnline = () => {
      if (document.visibilityState === "visible") {
        void mutate();
        void syncAppIconBadge(unreadCount);
      }
    };

    window.addEventListener("focus", handleVisibilityOrOnline);
    window.addEventListener("online", handleVisibilityOrOnline);
    document.addEventListener("visibilitychange", handleVisibilityOrOnline);

    return () => {
      window.removeEventListener("focus", handleVisibilityOrOnline);
      window.removeEventListener("online", handleVisibilityOrOnline);
      document.removeEventListener("visibilitychange", handleVisibilityOrOnline);
    };
  }, [user, mutate, unreadCount]);

  return null;
}
