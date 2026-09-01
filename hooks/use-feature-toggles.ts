import { useState, useEffect, useCallback } from "react";
import { useSystemSync } from "./use-system-sync";
import { useAuth } from "@/components/auth-provider";
import { canManageFeatureToggles } from "@/lib/roles";

export type FeatureToggleKey = "kitchen_display" | "order_board";

type ToggleMap = Record<FeatureToggleKey, boolean>;

const DEFAULT_TOGGLES: ToggleMap = {
  kitchen_display: true,
  order_board: true,
};

export function useFeatureToggles() {
  const { user } = useAuth();
  const [toggles, setToggles] = useState<ToggleMap>(DEFAULT_TOGGLES);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<FeatureToggleKey | null>(null);

  const { versions } = useSystemSync();
  const togglesVersion = versions["feature_toggles"];

  const canManage = canManageFeatureToggles(user?.role);

  const fetchToggles = useCallback(async () => {
    try {
      const res = await fetch("/api/feature-toggles");
      if (!res.ok) throw new Error("Failed to fetch feature toggles");
      const data = await res.json();
      setToggles((prev) => ({ ...prev, ...data.toggles }));
    } catch (error) {
      console.error("Error fetching feature toggles:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) fetchToggles();
  }, [fetchToggles, user]);

  useEffect(() => {
    if (togglesVersion && user) fetchToggles();
  }, [togglesVersion, fetchToggles, user]);

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
