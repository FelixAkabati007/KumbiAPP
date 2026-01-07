export type ThemeKey = "light" | "dark" | "hc" | "custom";
export type ThemeConfig = {
  name?: string;
  colors?: {
    primary?: string;
    secondary?: string;
    background?: string;
    foreground?: string;
    accent?: string;
    border?: string;
  };
  typography?: {
    fontSize?: string;
    lineHeight?: string;
  };
  spacing?: {
    base?: string;
  };
};

type StoredPref = {
  key: ThemeKey;
  config?: ThemeConfig;
  expiresAt?: number;
};

export function getThemePreference(): StoredPref | null {
  // LocalStorage removed for strict Neon-only compliance.
  // In a full implementation, this might fetch from a user profile endpoint.
  // For now, return null to fall back to system defaults.
  return null;
}

export function setThemePreference(
  key: ThemeKey,
  config?: ThemeConfig,
  ttlHours?: number
) {
  if (typeof window === "undefined") return;
  // LocalStorage removed.
  // We still dispatch the event so the current session updates instantly.
  const expiresAt =
    ttlHours && ttlHours > 0 ? Date.now() + ttlHours * 3600_000 : undefined;

  try {
    window.dispatchEvent(
      new CustomEvent("themeChanged", { detail: { key, config, expiresAt } })
    );
  } catch {}
}

export function applyCustomVariables(config?: ThemeConfig) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const c = config?.colors || {};
  if (c.primary) root.style.setProperty("--primary", c.primary);
  if (c.secondary) root.style.setProperty("--secondary", c.secondary);
  if (c.background) root.style.setProperty("--background", c.background);
  if (c.foreground) root.style.setProperty("--foreground", c.foreground);
  if (c.accent) root.style.setProperty("--accent", c.accent);
  if (c.border) root.style.setProperty("--border", c.border);
  const t = config?.typography || {};
  if (t.fontSize) root.style.setProperty("--font-size", t.fontSize);
  if (t.lineHeight) root.style.setProperty("--line-height", t.lineHeight);
  const s = config?.spacing || {};
  if (s.base) root.style.setProperty("--space-base", s.base);
}

export function applyTheme(key: ThemeKey, config?: ThemeConfig) {
  if (typeof document === "undefined") return;
  const html = document.documentElement;
  html.classList.remove("light", "dark", "hc", "custom");
  html.classList.add(key);
  if (key === "custom") applyCustomVariables(config);
}

export function previewTheme(key: ThemeKey, config?: ThemeConfig) {
  applyTheme(key, config);
}
