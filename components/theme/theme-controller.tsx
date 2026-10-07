"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
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
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!isMounted) return;

    let cancelled = false;
    const loadTheme = async () => {
      try {
        const response = await fetch("/api/theme/preferences", { cache: "no-store" });
        const pref = response.ok ? await response.json() : null;
        if (cancelled) return;
        if (pref?.key) {
          applyTheme(pref.key as ThemeKey, pref.config);
          setTheme(pref.key);
        } else {
          const settings = await import("@/lib/settings").then(({ fetchSettings }) => fetchSettings());
          if (cancelled) return;
          const defaultKey = (settings.theme as ThemeKey) || "system";
          setTheme(defaultKey);
          applyTheme(defaultKey);
        }
      } catch {
        if (!cancelled) {
          setTheme("light");
          applyTheme("light");
        }
      }
    };
    void loadTheme();
    return () => { cancelled = true; };

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
  }, [isMounted, setTheme, toast]);

  return null;
}
