import { DashboardPageShell } from "@/components/layout/dashboard-page-shell";
import { AvatarManager } from "@/components/user-account/avatar-manager";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UserRound } from "lucide-react";

export default function AccountPage() {
  return (
    <DashboardPageShell
      eyebrow="Personal profile"
      title="My Account"
      description="Update your personal profile without accessing administrative application settings."
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)]">
        <AvatarManager />
        <Card className="border-orange-200/80 bg-white/70 shadow-sm backdrop-blur-sm dark:border-orange-800 dark:bg-gray-900/60">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <UserRound className="h-4 w-4 text-orange-600" aria-hidden="true" />
              Profile access
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm leading-relaxed text-muted-foreground">
            <p>Your profile picture is visible in the application navigation and staff-facing activity records.</p>
            <p>Administrative controls, permissions, staff management, and system settings remain protected in Settings.</p>
          </CardContent>
        </Card>
      </div>
    </DashboardPageShell>
  );
}
