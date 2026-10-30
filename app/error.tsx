"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, Home, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AppErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[KumbiAPP ErrorBoundary]:", error);
  }, [error]);

  return (
    <div className="flex min-h-[100dvh] w-full items-center justify-center bg-gradient-to-br from-orange-50 via-amber-50 to-yellow-100 p-6 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950">
      <div className="w-full max-w-md rounded-2xl border border-orange-200/80 bg-white/95 p-6 text-center shadow-xl backdrop-blur-md dark:border-orange-800/60 dark:bg-gray-900/95">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950/70 dark:text-amber-400">
          <AlertTriangle className="h-7 w-7" />
        </div>
        <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
          Workspace Temporarily Interrupted
        </h2>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
          {error.message ||
            "An unexpected error occurred while rendering this view. Your offline queue and local session data remain safe."}
        </p>
        {error.digest && (
          <p className="mt-1 font-mono text-xs text-gray-400 dark:text-gray-500">
            Ref: {error.digest}
          </p>
        )}
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Button
            onClick={() => reset()}
            className="gap-2 bg-gradient-to-r from-orange-500 to-amber-600 text-white hover:from-orange-600 hover:to-amber-700"
          >
            <RefreshCw className="h-4 w-4" />
            Try Again
          </Button>
          <Button asChild variant="outline" className="gap-2">
            <Link href="/">
              <Home className="h-4 w-4" />
              Return to Dashboard
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
