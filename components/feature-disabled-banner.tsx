"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ShieldOff, ArrowLeft } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { useFeatureToggles, type FeatureToggleKey } from "@/hooks/use-feature-toggles";
import { useToast } from "@/hooks/use-toast";

export function FeatureDisabledBanner({
  featureKey,
  featureName,
}: {
  featureKey: FeatureToggleKey;
  featureName: string;
}) {
  const { user } = useAuth();
  const { setToggle } = useFeatureToggles();
  const { toast } = useToast();
  const canManage = user?.role === "admin" || user?.role === "manager";

  const handleReEnable = async () => {
    const ok = await setToggle(featureKey, true);
    if (ok) {
      toast({
        title: `${featureName} Enabled`,
        description: `${featureName} is now visible and usable across the app.`,
      });
      // This banner and the page component above it each hold their own
      // useFeatureToggles() instance, so a local state update here won't
      // flip the page's gating check. Reload so the page re-evaluates the
      // toggle against the freshly written database state immediately,
      // rather than waiting on the ~10s background sync poll.
      setTimeout(() => window.location.reload(), 600);
    } else {
      toast({
        title: "Error",
        description: `Failed to re-enable ${featureName}.`,
        variant: "destructive",
      });
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-orange-50 via-amber-50 to-yellow-50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-900 p-4">
      <Card className="max-w-md w-full bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border border-orange-200 dark:border-orange-700 rounded-3xl shadow-xl">
        <CardContent className="flex flex-col items-center gap-4 p-8 text-center">
          <div className="rounded-full bg-orange-100 dark:bg-orange-900/30 p-4">
            <ShieldOff className="h-8 w-8 text-orange-600 dark:text-orange-400" />
          </div>
          <div className="space-y-1">
            <h1 className="text-lg font-semibold text-gray-800 dark:text-gray-100">
              {featureName} is Disabled
            </h1>
            <p className="text-sm text-muted-foreground">
              An administrator has temporarily disabled this feature. Please
              check back later or contact your administrator.
            </p>
          </div>
          <div className="flex w-full flex-col gap-2 pt-2">
            {canManage && (
              <Button
                onClick={handleReEnable}
                className="w-full rounded-2xl bg-gradient-to-r from-orange-500 via-amber-500 to-yellow-500 hover:from-orange-600 hover:via-amber-600 hover:to-yellow-600 text-white shadow-lg"
              >
                Re-enable {featureName}
              </Button>
            )}
            <Link href="/" className="w-full">
              <Button variant="outline" className="w-full rounded-2xl">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Dashboard
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
