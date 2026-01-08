import { useState, useEffect, useCallback } from "react";
import { useSystemSync } from "./use-system-sync";

interface ReceiptStats {
  today: number;
  week: number;
  month: number;
  total: number;
}

export function useReceiptStats() {
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
    try {
      // Don't set loading to true on background updates to avoid flicker
      // only set if we don't have data yet?
      // Actually, keeping it simple:
      // setLoading(true);

      const res = await fetch("/api/receipts/stats");
      if (!res.ok) throw new Error("Failed to fetch stats");
      const data = await res.json();
      setStats(data);
      setError(null);
    } catch (err: any) {
      setError(err.message);
      console.error("Error fetching receipt stats:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  // Refetch when version changes
  useEffect(() => {
    if (ordersVersion) {
      fetchStats();
    }
  }, [ordersVersion, fetchStats]);

  return { stats, loading, error, refetch: fetchStats };
}
