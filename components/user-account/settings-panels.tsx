"use client";

import React, { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useTheme } from "next-themes";
import { useAuth } from "@/components/auth-provider";
import { getSettings, saveSettings, type AppSettings } from "@/lib/settings";
import { rolePermissions, type AppSection, type UserRole } from "@/lib/roles";
import { Bell, Monitor, Shield, Sparkles } from "lucide-react";

export function SettingsPanels() {
  const { toast } = useToast();
  const { setTheme } = useTheme();
  const { user } = useAuth();
  const [settings, setSettings] = useState<AppSettings>(getSettings());

  const canUpdateSecurity = user?.role === "admin" || user?.role === "manager";
  // Safely narrow user role to the known union for indexing rolePermissions
  const role: UserRole = useMemo(() => {
    const r = user?.role;
    return r === "admin" || r === "manager" || r === "staff" || r === "kitchen"
      ? r
      : "staff";
  }, [user?.role]);

  const roleSections = useMemo(() => rolePermissions[role], [role]);

  const updateSettings = (partial: Partial<AppSettings>) => {
    setSettings((prev) => {
      const next: AppSettings = {
        ...prev,
        ...partial,
        notifications: {
          ...prev.notifications,
          ...(partial.notifications ?? {}),
        },
        account: { ...prev.account, ...(partial.account ?? {}) },
        system: { ...prev.system, ...(partial.system ?? {}) },
        security: { ...prev.security, ...(partial.security ?? {}) },
      } as AppSettings;
      saveSettings(next);
      return next;
    });
    toast({ title: "Settings updated" });
  };

  return (
    <div
      className="grid grid-cols-1 gap-4 md:grid-cols-2"
      aria-label="Account settings panels"
      role="region"
    >
      {/* Personalization */}
      <Card className="bg-white/70 dark:bg-gray-800/70 border border-orange-200 dark:border-orange-700 shadow-xl relative overflow-hidden backdrop-blur-sm">
        <div className="absolute inset-0 bg-gradient-to-br from-orange-100/20 via-amber-100/20 to-yellow-100/20 dark:from-orange-900/20 dark:via-amber-900/20 dark:to-yellow-900/20 pointer-events-none"></div>
        <CardHeader className="rounded-t-3xl bg-gradient-to-r from-orange-500/10 via-amber-500/10 to-yellow-500/10 dark:from-orange-400/10 dark:via-amber-400/10 dark:to-yellow-400/10 relative z-10">
          <CardTitle className="flex items-center gap-2 text-gray-800 dark:text-gray-200">
            <span className="p-2 bg-gradient-to-br from-orange-500 via-amber-500 to-yellow-500 rounded-full shadow-lg">
              <Sparkles className="h-5 w-5 text-white" aria-hidden="true" />
            </span>
            Personalization
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 relative z-10">
          <div className="space-y-2">
            <Label htmlFor="theme-select">Theme</Label>
            <Select
              value={settings.theme}
              onValueChange={(v) => {
                setTheme(v);
                updateSettings({ theme: v as AppSettings["theme"] });
              }}
            >
              <SelectTrigger id="theme-select" aria-label="Select theme">
                <SelectValue placeholder="Select theme" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="system">System</SelectItem>
                <SelectItem value="light">Light</SelectItem>
                <SelectItem value="dark">Dark</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="compact-mode">Compact mode</Label>
            <Switch
              id="compact-mode"
              checked={!!settings.system.compactMode}
              onCheckedChange={(v) =>
                updateSettings({
                  system: { ...settings.system, compactMode: v },
                })
              }
              aria-label="Toggle compact mode"
            />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="animations">Animations</Label>
            <Switch
              id="animations"
              checked={!!settings.system.animations}
              onCheckedChange={(v) =>
                updateSettings({
                  system: { ...settings.system, animations: v },
                })
              }
              aria-label="Toggle animations"
            />
          </div>
        </CardContent>
      </Card>

      {/* Notifications */}
      <Card className="bg-white/70 dark:bg-gray-800/70 border border-orange-200 dark:border-orange-700 shadow-xl relative overflow-hidden backdrop-blur-sm">
        <div className="absolute inset-0 bg-gradient-to-br from-orange-100/20 via-amber-100/20 to-yellow-100/20 dark:from-orange-900/20 dark:via-amber-900/20 dark:to-yellow-900/20 pointer-events-none"></div>
        <CardHeader className="rounded-t-3xl bg-gradient-to-r from-orange-500/10 via-amber-500/10 to-yellow-500/10 dark:from-orange-400/10 dark:via-amber-400/10 dark:to-yellow-400/10 relative z-10">
          <CardTitle className="flex items-center gap-2 text-gray-800 dark:text-gray-200">
            <span className="p-2 bg-gradient-to-br from-orange-500 via-amber-500 to-yellow-500 rounded-full shadow-lg">
              <Bell className="h-5 w-5 text-white" aria-hidden="true" />
            </span>
            Notifications
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 relative z-10">
          {(
            [
              { key: "orderAlerts", label: "Order alerts" },
              { key: "lowStockAlerts", label: "Low stock alerts" },
              { key: "paymentAlerts", label: "Payment alerts" },
              { key: "soundEnabled", label: "Sound" },
              { key: "emailNotifications", label: "Email" },
            ] as const
          ).map(({ key, label }) => (
            <div key={key} className="flex items-center justify-between">
              <Label htmlFor={`notif-${key}`}>{label}</Label>
              <Switch
                id={`notif-${key}`}
                checked={!!settings.notifications[key]}
                onCheckedChange={(v) =>
                  updateSettings({
                    notifications: { ...settings.notifications, [key]: v },
                  })
                }
                aria-label={`Toggle ${label}`}
              />
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Security */}
      <Card className="bg-white/70 dark:bg-gray-800/70 border border-orange-200 dark:border-orange-700 shadow-xl relative overflow-hidden backdrop-blur-sm">
        <div className="absolute inset-0 bg-gradient-to-br from-orange-100/20 via-amber-100/20 to-yellow-100/20 dark:from-orange-900/20 dark:via-amber-900/20 dark:to-yellow-900/20 pointer-events-none"></div>
        <CardHeader className="rounded-t-3xl bg-gradient-to-r from-orange-500/10 via-amber-500/10 to-yellow-500/10 dark:from-orange-400/10 dark:via-amber-400/10 dark:to-yellow-400/10 relative z-10">
          <CardTitle className="flex items-center gap-2 text-gray-800 dark:text-gray-200">
            <span className="p-2 bg-gradient-to-br from-orange-500 via-amber-500 to-yellow-500 rounded-full shadow-lg">
              <Shield className="h-5 w-5 text-white" aria-hidden="true" />
            </span>
            Security
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 relative z-10">
          <div className="flex items-center justify-between">
            <Label htmlFor="require-login">Require login</Label>
            <Switch
              id="require-login"
              checked={!!settings.security.requireLogin}
              onCheckedChange={(v) =>
                canUpdateSecurity &&
                updateSettings({
                  security: { ...settings.security, requireLogin: v },
                })
              }
              disabled={!canUpdateSecurity}
              aria-label="Toggle require login"
            />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="two-factor">Two-factor auth</Label>
            <Switch
              id="two-factor"
              checked={!!settings.security.twoFactorAuth}
              onCheckedChange={(v) =>
                canUpdateSecurity &&
                updateSettings({
                  security: { ...settings.security, twoFactorAuth: v },
                })
              }
              disabled={!canUpdateSecurity}
              aria-label="Toggle two-factor authentication"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="session-timeout">Session timeout (minutes)</Label>
            <Input
              id="session-timeout"
              type="number"
              min={5}
              max={240}
              value={settings.security.sessionTimeout}
              onChange={(e) =>
                canUpdateSecurity &&
                updateSettings({
                  security: {
                    ...settings.security,
                    sessionTimeout: Number(e.target.value),
                  },
                })
              }
              disabled={!canUpdateSecurity}
              aria-label="Set session timeout in minutes"
            />
          </div>
          {!canUpdateSecurity && (
            <p className="text-sm text-muted-foreground" aria-live="polite">
              Only managers and admins can change security preferences.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Role-specific overview */}
      <Card className="bg-white/70 dark:bg-gray-800/70 border border-orange-200 dark:border-orange-700 shadow-xl relative overflow-hidden backdrop-blur-sm">
        <div className="absolute inset-0 bg-gradient-to-br from-orange-100/20 via-amber-100/20 to-yellow-100/20 dark:from-orange-900/20 dark:via-amber-900/20 dark:to-yellow-900/20 pointer-events-none"></div>
        <CardHeader className="rounded-t-3xl bg-gradient-to-r from-orange-500/10 via-amber-500/10 to-yellow-500/10 dark:from-orange-400/10 dark:via-amber-400/10 dark:to-yellow-400/10 relative z-10">
          <CardTitle className="flex items-center gap-2 text-gray-800 dark:text-gray-200">
            <span className="p-2 bg-gradient-to-br from-orange-500 via-amber-500 to-yellow-500 rounded-full shadow-lg">
              <Monitor className="h-5 w-5 text-white" aria-hidden="true" />
            </span>
            Role Access
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 relative z-10">
          <p className="text-sm text-muted-foreground">
            Access for your role: {user?.role ?? "guest"}
          </p>
          <div
            className="grid grid-cols-2 gap-2"
            role="list"
            aria-label="Role section access"
          >
            {(Object.keys(roleSections) as AppSection[]).map((section) => {
              const allowed = roleSections[section];
              return (
                <div
                  key={section}
                  className={`flex items-center justify-between rounded-md border p-2 ${
                    allowed
                      ? "border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-900/20"
                      : "border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/20"
                  }`}
                  role="listitem"
                  aria-label={`${section} ${
                    allowed ? "allowed" : "restricted"
                  }`}
                >
                  <span className="text-sm capitalize">{section}</span>
                  <span
                    className={
                      "rounded px-2 py-0.5 text-xs " +
                      (allowed
                        ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300"
                        : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300")
                    }
                  >
                    {allowed ? "Allowed" : "Restricted"}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="flex justify-end">
            <Button
              type="button"
              variant="outline"
              className="border-orange-200 dark:border-orange-700 bg-white/50 dark:bg-gray-800/50 hover:bg-orange-50 dark:hover:bg-orange-900/20 text-orange-700 dark:text-orange-300"
              onClick={() => toast({ title: "Role access loaded" })}
            >
              Refresh
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default SettingsPanels;
