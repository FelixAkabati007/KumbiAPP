import { useState, useEffect, useCallback } from "react";
import { useSystemSync } from "./use-system-sync";
import { useAuth } from "@/components/auth-provider";
import { useRealtime } from "@/components/realtime-provider";
import { apiFetch, ApiError, isExpectedRequestError } from "@/lib/api-client";
import {
  getCachedReceiptStats,
  getQueuedOrders,
  setCachedReceiptStats,
  subscribeOfflineQueue,
} from "@/lib/offline-storage";

interface ReceiptStats {
  today: number;
  week: number;
  month: number;
  total: number;
}

function addPendingOfflineCounts(base: ReceiptStats): ReceiptStats {
  const queued = getQueuedOrders();
  if (queued.length === 0) return base;

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const dayOfWeek = (now.getDay() + 6) % 7; // Monday = 0
  const weekStart = todayStart - dayOfWeek * 86_400_000;
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

  let extraToday = 0;
  let extraWeek = 0;
  let extraMonth = 0;
  for (const order of queued) {
    const createdMs = new Date(order.createdAt || now.toISOString()).getTime();
    const ts = Number.isFinite(createdMs) ? createdMs : now.getTime();
    if (ts >= todayStart) extraToday++;
    if (ts >= weekStart) extraWeek++;
    if (ts >= monthStart) extraMonth++;
  }

  return {
    today: base.today + extraToday,
    week: base.week + extraWeek,
    month: base.month + extraMonth,
    total: base.total + queued.length,
  };
}

export function useReceiptStats() {
  const { user } = useAuth();
  const { lastEvent } = useRealtime();
  const [stats, setStats] = useState<ReceiptStats>({
    today: 0,
    week: 0,
    month: 0,
    total: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { versions } = useSystemSync();
  const ordersVersion = versions["orders"];

  const fetchStats = useCallback(async () => {
    // Skip fetch for kitchen role as they don't need financial stats
    if (user?.role === "kitchen") {
      setLoading(false);
      return;
    }

    if (typeof navigator !== "undefined" && !navigator.onLine) {
      const cached = getCachedReceiptStats();
      const base = cached
        ? { today: cached.today, week: cached.week, month: cached.month, total: cached.total }
        : { today: 0, week: 0, month: 0, total: 0 };
      setStats(addPendingOfflineCounts(base));
      setLoading(false);
      return;
    }

    try {
      const data = await apiFetch<ReceiptStats>("/api/receipts/stats");
      setCachedReceiptStats(data);
      setStats(addPendingOfflineCounts(data));
      setError(null);
    } catch (err: unknown) {
      if (isExpectedRequestError(err)) return;
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        setStats(addPendingOfflineCounts({ today: 0, week: 0, month: 0, total: 0 }));
        return;
      }
      const cached = getCachedReceiptStats();
      if (cached) {
        setStats(
          addPendingOfflineCounts({
            today: cached.today,
            week: cached.week,
            month: cached.month,
            total: cached.total,
          }),
        );
      }
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("An unknown error occurred");
      }
      if (!isExpectedRequestError(err)) {
        console.error("Error fetching receipt stats:", err);
      }
    } finally {
      setLoading(false);
    }
  }, [user?.role]);

  // Initial fetch
  useEffect(() => {
    if (user) {
      void fetchStats();
    }
  }, [fetchStats, user]);

  // Refresh immediately on realtime POS/order/finance/hotel/event events
  useEffect(() => {
    if (!user || !lastEvent) return;
    if (
      lastEvent.topic === "orders.updated" ||
      lastEvent.topic === "pos.updated" ||
      lastEvent.topic === "finance.updated" ||
      lastEvent.topic === "hotels.updated" ||
      lastEvent.topic === "events.updated"
    ) {
      void fetchStats();
    }
  }, [lastEvent, fetchStats, user]);

  // Refetch when version changes, offline queue changes, or online status recovers
  useEffect(() => {
    if (!user) return;
    let timer: number | null = null;
    const poll = () => {
      if (!document.hidden) void fetchStats();
    };
    const start = () => {
      if (timer === null) timer = window.setInterval(poll, 15000);
    };
    const stop = () => {
      if (timer !== null) {
        window.clearInterval(timer);
        timer = null;
      }
    };
    if (ordersVersion && !document.hidden) void fetchStats();
    const handleVisibilityChange = () => {
      if (document.hidden) stop();
      else {
        void fetchStats();
        start();
      }
    };
    const handleImmediateRefresh = () => {
      void fetchStats();
    };
    const unsubscribeOffline = subscribeOfflineQueue(() => {
      void fetchStats();
    });

    start();
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("online", handleImmediateRefresh);
    window.addEventListener("kumbi:offline-synced", handleImmediateRefresh);
    window.addEventListener("kumbi:receipts-updated", handleImmediateRefresh);
    return () => {
      stop();
      unsubscribeOffline();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("online", handleImmediateRefresh);
      window.removeEventListener("kumbi:offline-synced", handleImmediateRefresh);
      window.removeEventListener("kumbi:receipts-updated", handleImmediateRefresh);
    };
  }, [ordersVersion, fetchStats, user]);

  return { stats, loading, error, refetch: fetchStats };
}
