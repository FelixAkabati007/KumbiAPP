"use client";

import type React from "react";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { fetchSettings, getSettings, saveSettings, type AppSettings } from "@/lib/settings";

interface SettingsContextType {
  settings: AppSettings;
  updateSettings: (newSettings: Partial<AppSettings>) => void;
  resetSettings: () => void;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

const PUBLIC_AUTH_PATHS = ["/login", "/signup", "/sign-up", "/forgot-password", "/reset-password"];

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [settings, setSettings] = useState<AppSettings>(() => getSettings(true));
  const isAuthPage = Boolean(
    pathname && PUBLIC_AUTH_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`)),
  );

  // Load settings from server on mount (skipping unauthenticated auth routes to preserve Neon scale-to-zero)
  useEffect(() => {
    let cancelled = false;

    // Apply cached logo immediately on client mount
    if (typeof window !== "undefined") {
      try {
        const cachedLogo = localStorage.getItem("kumbi_cached_logo");
        if (cachedLogo && !cancelled) {
          setSettings((prev) => ({
            ...prev,
            account: { ...prev.account, logo: cachedLogo },
          }));
        }
      } catch {
        // ignore
      }
    }

    if (isAuthPage) {
      return () => {
        cancelled = true;
      };
    }

    fetchSettings().then((saved) => {
      if (!cancelled) setSettings(saved);
    });
    return () => {
      cancelled = true;
    };
  }, [isAuthPage]);

  // Re-fetch settings whenever they're saved elsewhere (e.g. the Settings page),
  // so any already-mounted consumer (Receipt, Kitchen, header logo, etc.) picks up
  // the change immediately without needing a full page reload or navigation.
  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      fetchSettings().then((saved) => {
        if (!cancelled) setSettings(saved);
      });
    };
    window.addEventListener("settingsUpdated", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      cancelled = true;
      window.removeEventListener("settingsUpdated", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  const updateSettings = useCallback((newSettings: Partial<AppSettings>) => {
    setSettings((prev) => {
      const updated: AppSettings = {
        ...prev,
        ...newSettings,
        notifications: { ...prev.notifications, ...newSettings.notifications },
        account: { ...prev.account, ...newSettings.account },
        system: { ...prev.system, ...newSettings.system },
        security: { ...prev.security, ...newSettings.security },
      };
      void saveSettings(updated).catch((error) => {
        console.error("[v0] Settings provider failed to persist changes:", error);
      });
      return updated;
    });
  }, []);

  const resetSettings = useCallback(() => {
    const defaults = getSettings(true);
    setSettings((current) => ({ ...defaults, version: current.version }));
    void saveSettings({ ...defaults, version: settings.version }).catch((error) => {
      console.error("[v0] Settings provider failed to reset settings:", error);
    });
  }, [settings.version]);

  return (
    <SettingsContext.Provider value={{ settings, updateSettings, resetSettings }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (context === undefined) {
    throw new Error("useSettings must be used within a SettingsProvider");
  }
  return context;
}
