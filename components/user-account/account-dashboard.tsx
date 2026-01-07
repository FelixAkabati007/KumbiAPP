"use client";

import React from "react";
import { AvatarManager } from "@/components/user-account/avatar-manager";
import { SettingsPanels } from "@/components/user-account/settings-panels";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { User } from "lucide-react";
import { useAuth } from "@/components/auth-provider";

export function AccountDashboard() {
  const { user } = useAuth();

  return (
    <section
      className="w-full max-w-5xl mx-auto px-4 sm:px-6 md:px-8 py-8 space-y-8"
      aria-label="User account dashboard"
      role="region"
    >
      <Card className="rounded-3xl shadow-xl border border-orange-200 dark:border-orange-700 bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm">
        <CardHeader className="rounded-t-3xl px-6 pt-6 pb-4">
          <CardTitle className="flex items-center gap-3 text-lg sm:text-xl text-gray-800 dark:text-gray-200">
            <span className="p-2 bg-gradient-to-br from-orange-500 via-amber-500 to-yellow-500 rounded-full shadow-lg">
              <User className="h-5 w-5 text-white" aria-hidden="true" />
            </span>
            Account
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 lg:gap-10">
            <div className="lg:col-span-1 flex flex-col items-center justify-start">
              <AvatarManager />
            </div>
            <div className="lg:col-span-2">
              <SettingsPanels />
            </div>
          </div>
        </CardContent>
      </Card>
      <div
        className="text-sm text-gray-600 dark:text-gray-400 text-center pt-2"
        aria-live="polite"
      >
        Signed in as {user?.email ?? user?.id ?? "guest"} · Role:{" "}
        {user?.role ?? "guest"}
      </div>
    </section>
  );
}

export default AccountDashboard;
