"use client";

import type React from "react";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { fetchSettings, getSettings, saveSettings, type AppSettings } from "@/lib/settings";

interface SettingsContextType {
  settings: AppSettings;
  updateSettings: (newSettings: Partial<AppSettings>) => void;
  resetSettings: () => void;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(() => getSettings());

  // Load settings from server on mount — children always render immediately
  useEffect(() => {
    let cancelled = false;
    fetchSettings().then((saved) => {
      if (!cancelled) setSettings(saved);
    });
    return () => { cancelled = true; };
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
      saveSettings(updated);
      return updated;
    });
  }, []);

  const resetSettings = useCallback(() => {
    const defaults = getSettings(true);
    setSettings(defaults);
    saveSettings(defaults);
  }, []);

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
