import { useState, useEffect, useCallback } from "react";
import { useSystemSync } from "./use-system-sync";
import { useAuth } from "@/components/auth-provider";
import { useOptionalRealtime } from "@/components/realtime-provider";
import { canManageFeatureToggles } from "@/lib/roles";
import { apiFetch, isExpectedRequestError } from "@/lib/api-client";

export type FeatureToggleKey = "kitchen_display" | "order_board" | "housekeeping_advanced";

type ToggleMap = {
  kitchen_display: boolean;
  order_board: boolean;
  housekeeping_advanced?: boolean;
};

const DEFAULT_TOGGLES: ToggleMap = {
  kitchen_display: true,
  order_board: true,
  housekeeping_advanced: true,
};

export function useFeatureToggles() {
  const { user } = useAuth();
  const realtime = useOptionalRealtime();
  const lastEvent = realtime?.lastEvent ?? null;
  const [toggles, setToggles] = useState<ToggleMap>(DEFAULT_TOGGLES);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<FeatureToggleKey | null>(null);

  const { versions } = useSystemSync();
  const togglesVersion = versions["feature_toggles"];

  const canManage = canManageFeatureToggles(user?.role) || user?.role === "manager";

  const fetchToggles = useCallback(async () => {
    try {
      const data = await apiFetch<{ toggles: Partial<ToggleMap> }>("/api/feature-toggles", {
        cache: "no-store",
      });
      if (data?.toggles) {
        setToggles((prev) => ({
          ...prev,
          kitchen_display:
            typeof data.toggles.kitchen_display === "boolean"
              ? data.toggles.kitchen_display
              : prev.kitchen_display,
          order_board:
            typeof data.toggles.order_board === "boolean"
              ? data.toggles.order_board
              : prev.order_board,
          housekeeping_advanced:
            typeof data.toggles.housekeeping_advanced === "boolean"
              ? data.toggles.housekeeping_advanced
              : prev.housekeeping_advanced,
        }));
      }
    } catch (error) {
      if (!isExpectedRequestError(error)) console.error("Error fetching feature toggles:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) {
      void fetchToggles();
    }
  }, [fetchToggles, user]);

  useEffect(() => {
    if (togglesVersion && user) {
      void fetchToggles();
    }
  }, [togglesVersion, fetchToggles, user]);

  // Instant SSE sync whenever Admin/Manager flips Kitchen Display or Order Board
  useEffect(() => {
    if (lastEvent?.topic === "feature_toggles.updated" && user) {
      void fetchToggles();
    }
  }, [lastEvent, fetchToggles, user]);

  // Same-window custom event + tab focus / reconnect listeners
  useEffect(() => {
    if (typeof window === "undefined" || !user) return;
    const handleLocalUpdate = () => {
      void fetchToggles();
    };
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        void fetchToggles();
      }
    };
    window.addEventListener("featureTogglesUpdated", handleLocalUpdate);
    window.addEventListener("focus", handleLocalUpdate);
    window.addEventListener("online", handleLocalUpdate);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.removeEventListener("featureTogglesUpdated", handleLocalUpdate);
      window.removeEventListener("focus", handleLocalUpdate);
      window.removeEventListener("online", handleLocalUpdate);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [fetchToggles, user]);

  const setToggle = useCallback(
    async (key: FeatureToggleKey, enabled: boolean) => {
      setUpdating(key);
      try {
        const res = await fetch("/api/feature-toggles", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key, enabled }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Failed to update feature toggle");
        }
        setToggles((prev) => ({ ...prev, [key]: enabled }));
        if (typeof window !== "undefined") {
          window.dispatchEvent(new Event("featureTogglesUpdated"));
        }
        return true;
      } catch (error) {
        console.error("Error updating feature toggle:", error);
        return false;
      } finally {
        setUpdating(null);
      }
    },
    []
  );

  return { toggles, loading, updating, canManage, setToggle, refetch: fetchToggles };
}
