"use client";

import { useTheme } from "next-themes";
import { useEffect } from "react";
import {
  getThemePreference,
  applyTheme,
  type ThemeKey,
} from "@/lib/theme-manager";
import { getSettings } from "@/lib/settings";
import { useToast } from "@/hooks/use-toast";

export function ThemeController() {
  const { setTheme } = useTheme();
  const { toast } = useToast();

  useEffect(() => {
    try {
      const pref = getThemePreference();
      if (pref && pref.key) {
        applyTheme(pref.key as ThemeKey, pref.config);
        setTheme(pref.key);
      } else {
        const settings = getSettings();
        const defaultKey =
          (settings.theme as ThemeKey) || ("light" as ThemeKey);
        setTheme(defaultKey);
        applyTheme(defaultKey);
      }
    } catch {
      setTheme("light");
      applyTheme("light");
    }

    const handler = (e: Event) => {
      // visual feedback on theme change
      const detail = (e as CustomEvent).detail as
        | { key?: ThemeKey }
        | undefined;
      const key =
        detail?.key ||
        (document.documentElement.classList.contains("dark")
          ? "dark"
          : "light");
      toast({ title: "Theme Applied", description: `Theme: ${key}` });
    };
    window.addEventListener("themeChanged", handler as EventListener);
    return () =>
      window.removeEventListener("themeChanged", handler as EventListener);
  }, [setTheme, toast]);

  return null;
}
