"use client";

import { ShieldCheck } from "lucide-react";
import { AnnouncementCard } from "@/components/announcement-card";
import { Card, CardContent } from "@/components/ui/card";

export function FrontendAnnouncementsCard() {
  return (
    <Card className="border-orange-200 bg-white/70 shadow-sm backdrop-blur-sm dark:border-orange-700 dark:bg-gray-800/70">
      <CardContent className="p-3 sm:p-5">
        <div className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="size-4 text-orange-600 dark:text-orange-400" aria-hidden="true" />
          <span>Admin and manager access</span>
        </div>
        <AnnouncementCard embedded />
      </CardContent>
    </Card>
  );
}
