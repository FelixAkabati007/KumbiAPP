"use client";

import { Megaphone, ShieldCheck } from "lucide-react";
import { AnnouncementCard } from "@/components/announcement-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function FrontendAnnouncementsCard() {
  return (
    <Card className="border-orange-200 bg-white/70 shadow-sm backdrop-blur-sm dark:border-orange-700 dark:bg-gray-800/70">
      <CardHeader className="flex flex-col gap-3 border-b border-orange-100 pb-4 dark:border-orange-800 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-orange-100 p-2 text-orange-700 dark:bg-orange-950 dark:text-orange-300">
            <Megaphone className="size-5" aria-hidden="true" />
          </div>
          <div>
            <CardTitle className="text-base">Management announcements</CardTitle>
            <CardDescription>Publish and review updates for your operational teams.</CardDescription>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="size-4 text-orange-600 dark:text-orange-400" aria-hidden="true" />
          <span>Admin and manager access</span>
        </div>
      </CardHeader>
      <CardContent className="p-3 sm:p-5">
        <AnnouncementCard embedded />
      </CardContent>
    </Card>
  );
}
