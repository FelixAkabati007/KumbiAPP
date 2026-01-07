"use client";

import type React from "react";

import { createContext, useContext, useEffect, useState } from "react";
import { fetchSettings, getSettings, saveSettings, type AppSettings } from "@/lib/settings";

interface SettingsContextType {
  settings: AppSettings;
  updateSettings: (newSettings: Partial<AppSettings>) => void;
  resetSettings: () => void;
}

const SettingsContext = createContext<SettingsContextType | undefined>(
  undefined,
);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(() => getSettings());

  useEffect(() => {
    async function loadSettings() {
      const savedSettings = await fetchSettings();
      setSettings(savedSettings);
    }
    loadSettings();
  }, []);

  const updateSettings = (newSettings: Partial<AppSettings>) => {
    const updatedSettings = {
      ...settings,
      ...newSettings,
      notifications: {
        ...settings.notifications,
        ...newSettings.notifications,
      },
      account: {
        ...settings.account,
        ...newSettings.account,
      },
      system: {
        ...settings.system,
        ...newSettings.system,
      },
      security: {
        ...settings.security,
        ...newSettings.security,
      },
    };
    setSettings(updatedSettings);
    saveSettings(updatedSettings);
  };

  const resetSettings = () => {
    const defaultSettings = getSettings(true);
    setSettings(defaultSettings);
    saveSettings(defaultSettings);
  };

  return (
    <SettingsContext.Provider
      value={{ settings, updateSettings, resetSettings }}
    >
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
