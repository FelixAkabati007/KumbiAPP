"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  previewTheme,
  applyTheme,
  getThemePreference,
  setThemePreference,
  type ThemeConfig,
} from "@/lib/theme-manager";
import { useTheme } from "next-themes";

type ThemeKey = "light" | "dark" | "hc" | "custom";

export function ThemeSelector() {
  const { setTheme: setBaseTheme, resolvedTheme } = useTheme();
  const [themeKey, setThemeKey] = useState<ThemeKey>("light");
  const [name, setName] = useState("");
  const [colors, setColors] = useState({
    primary: "220 70% 50%",
    secondary: "27 87% 67%",
    background: "0 0% 100%",
    foreground: "0 0% 3.9%",
    accent: "12 76% 61%",
    border: "0 0% 89.8%",
  });
  const [typography, setTypography] = useState({
    fontSize: "16px",
    lineHeight: "1.5",
  });
  const [spacing, setSpacing] = useState({ base: "8px" });
  const config: ThemeConfig = useMemo(
    () => ({ name, colors, typography, spacing }),
    [name, colors, typography, spacing],
  );
  const [isPreviewing, setIsPreviewing] = useState(false);
  const allowed: ThemeKey[] = ["light", "dark", "hc", "custom"];

  useEffect(() => {
    const pref = getThemePreference();
    if (pref) {
      setThemeKey(pref.key);
      if (pref.key === "custom" && pref.config) {
        setName(pref.config.name || "");
        setColors({
          primary: pref.config.colors?.primary || colors.primary,
          secondary: pref.config.colors?.secondary || colors.secondary,
          background: pref.config.colors?.background || colors.background,
          foreground: pref.config.colors?.foreground || colors.foreground,
          accent: pref.config.colors?.accent || colors.accent,
          border: pref.config.colors?.border || colors.border,
        });
        setTypography({
          fontSize: pref.config.typography?.fontSize || typography.fontSize,
          lineHeight:
            pref.config.typography?.lineHeight || typography.lineHeight,
        });
        setSpacing({ base: pref.config.spacing?.base || spacing.base });
      }
      applyTheme(pref.key, pref.config);
      setBaseTheme(pref.key);
    } else {
      setBaseTheme(resolvedTheme || "light");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePreview = () => {
    if (!allowed.includes(themeKey)) {
      console.error("Invalid theme key", themeKey);
      return;
    }
    setIsPreviewing(true);
    try {
      previewTheme(themeKey, themeKey === "custom" ? config : undefined);
      setBaseTheme(themeKey);
      const bg = getComputedStyle(document.documentElement).getPropertyValue(
        "--background",
      );
      if (!bg) {
        console.warn("Theme background token missing, falling back to light");
        previewTheme("light");
        setBaseTheme("light");
      }
    } catch (e) {
      console.error("Theme preview failed", e);
    }
  };

  const handleApply = async () => {
    if (!allowed.includes(themeKey)) {
      console.error("Invalid theme key", themeKey);
      return;
    }
    try {
      applyTheme(themeKey, themeKey === "custom" ? config : undefined);
      setBaseTheme(themeKey);
      setThemePreference(
        themeKey,
        themeKey === "custom" ? config : undefined,
        720,
      );
      const res = await fetch("/api/theme/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: themeKey, config }),
      });
      if (!res.ok) {
        console.error("Failed to persist theme preference", await res.text());
      }
    } catch (e) {
      console.error("Theme apply failed", e);
    } finally {
      setIsPreviewing(false);
    }
  };

  const handleSaveCustom = async () => {
    if (themeKey !== "custom") return;
    const payload = { name: name || "Custom", config };
    try {
      const res = await fetch("/api/theme/themes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      await res.text();
    } catch {}
  };

  return (
    <Card className="rounded-2xl">
      <CardHeader>
        <CardTitle>Theme</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label>Theme</Label>
            <Select
              value={themeKey}
              onValueChange={(v) => setThemeKey(v as ThemeKey)}
            >
              <SelectTrigger className="rounded-2xl">
                <SelectValue placeholder="Select theme" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="light">Light</SelectItem>
                <SelectItem value="dark">Dark</SelectItem>
                <SelectItem value="hc">High Contrast</SelectItem>
                <SelectItem value="custom">Custom</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Custom Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Theme"
              className="rounded-2xl"
            />
          </div>
          <div className="flex items-end gap-2">
            <Button
              variant="brandSecondary"
              className="rounded-2xl"
              onClick={handlePreview}
            >
              Preview
            </Button>
            <Button
              variant="brand"
              className="rounded-2xl"
              onClick={handleApply}
            >
              Apply
            </Button>
          </div>
        </div>

        {themeKey === "custom" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Primary</Label>
              <Input
                value={colors.primary}
                onChange={(e) =>
                  setColors({ ...colors, primary: e.target.value })
                }
                className="rounded-2xl"
              />
              <Label>Secondary</Label>
              <Input
                value={colors.secondary}
                onChange={(e) =>
                  setColors({ ...colors, secondary: e.target.value })
                }
                className="rounded-2xl"
              />
              <Label>Accent</Label>
              <Input
                value={colors.accent}
                onChange={(e) =>
                  setColors({ ...colors, accent: e.target.value })
                }
                className="rounded-2xl"
              />
            </div>
            <div className="space-y-2">
              <Label>Background</Label>
              <Input
                value={colors.background}
                onChange={(e) =>
                  setColors({ ...colors, background: e.target.value })
                }
                className="rounded-2xl"
              />
              <Label>Foreground</Label>
              <Input
                value={colors.foreground}
                onChange={(e) =>
                  setColors({ ...colors, foreground: e.target.value })
                }
                className="rounded-2xl"
              />
              <Label>Border</Label>
              <Input
                value={colors.border}
                onChange={(e) =>
                  setColors({ ...colors, border: e.target.value })
                }
                className="rounded-2xl"
              />
            </div>
            <div className="space-y-2">
              <Label>Font Size</Label>
              <Input
                value={typography.fontSize}
                onChange={(e) =>
                  setTypography({ ...typography, fontSize: e.target.value })
                }
                className="rounded-2xl"
              />
              <Label>Line Height</Label>
              <Input
                value={typography.lineHeight}
                onChange={(e) =>
                  setTypography({ ...typography, lineHeight: e.target.value })
                }
                className="rounded-2xl"
              />
            </div>
            <div className="space-y-2">
              <Label>Base Spacing</Label>
              <Input
                value={spacing.base}
                onChange={(e) =>
                  setSpacing({ ...spacing, base: e.target.value })
                }
                className="rounded-2xl"
              />
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                className="rounded-2xl"
                onClick={handleSaveCustom}
              >
                Save Custom
              </Button>
              {isPreviewing && (
                <span className="text-sm text-muted-foreground">
                  Preview active
                </span>
              )}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="rounded-2xl border">
            <CardHeader>
              <CardTitle>Light Preview</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="p-4 bg-white text-black rounded-xl">Aa</div>
            </CardContent>
          </Card>
          <Card className="rounded-2xl border">
            <CardHeader>
              <CardTitle>Dark Preview</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="p-4 bg-black text-white rounded-xl">Aa</div>
            </CardContent>
          </Card>
          <Card className="rounded-2xl border">
            <CardHeader>
              <CardTitle>High Contrast Preview</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="p-4 bg-white text-black border rounded-xl">
                Aa
              </div>
            </CardContent>
          </Card>
          <Card className="rounded-2xl border">
            <CardHeader>
              <CardTitle>Custom Preview</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="p-4 rounded-xl bg-highlight text-highlight-foreground">
                Aa
              </div>
            </CardContent>
          </Card>
        </div>
      </CardContent>
    </Card>
  );
}
