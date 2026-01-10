import { useState, useEffect, useCallback } from "react";
import { useSystemSync } from "./use-system-sync";
import { useAuth } from "@/components/auth-provider";

interface ReceiptStats {
  today: number;
  week: number;
  month: number;
  total: number;
}

export function useReceiptStats() {
  const { user } = useAuth();
  const [stats, setStats] = useState<ReceiptStats>({
    today: 0,
    week: 0,
    month: 0,
    total: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { versions } = useSystemSync();
  // Listen for changes in "orders" key from system state
  // This ensures we re-fetch stats when a new order/transaction is logged
  const ordersVersion = versions["orders"];

  const fetchStats = useCallback(async () => {
    // Skip fetch for kitchen role as they don't need financial stats
    if (user?.role === "kitchen") {
      setLoading(false);
      return;
    }

    try {
      // Don't set loading to true on background updates to avoid flicker
      // only set if we don't have data yet?
      // Actually, keeping it simple:
      // setLoading(true);

      const res = await fetch("/api/receipts/stats");
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          setStats({ today: 0, week: 0, month: 0, total: 0 });
          return;
        }
        throw new Error("Failed to fetch stats");
      }
      const data = await res.json();
      setStats(data);
      setError(null);
    } catch (err: unknown) {
      if (err instanceof Error) {
        if (err.name === "AbortError") return;
        if (
          err.message?.includes("Unauthorized") ||
          err.message?.includes("Forbidden")
        ) {
          setStats({ today: 0, week: 0, month: 0, total: 0 });
          return;
        }
        setError(err.message);
      } else {
        setError("An unknown error occurred");
      }
      console.error("Error fetching receipt stats:", err);
    } finally {
      setLoading(false);
    }
  }, [user?.role]);

  // Initial fetch
  useEffect(() => {
    if (user) {
      fetchStats();
    }
  }, [fetchStats, user]);

  // Refetch when version changes
  useEffect(() => {
    if (ordersVersion && user) {
      fetchStats();
    }
  }, [ordersVersion, fetchStats, user]);

  return { stats, loading, error, refetch: fetchStats };
}
