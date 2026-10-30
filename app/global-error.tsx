"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function GlobalErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[KumbiAPP GlobalErrorBoundary]:", error);
  }, [error]);

  return (
    <html lang="en">
      <body className="flex min-h-screen items-center justify-center bg-amber-50 p-6 text-gray-900 antialiased">
        <div className="w-full max-w-md rounded-2xl border border-amber-200 bg-white p-6 text-center shadow-lg">
          <h1 className="text-xl font-bold text-gray-900">
            Kumbisaly Heritage System Recovery
          </h1>
          <p className="mt-2 text-sm text-gray-600">
            A critical application error occurred. Any queued offline transactions remain safely stored on this device.
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <button
              type="button"
              onClick={() => reset()}
              className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700"
            >
              Reload Application
            </button>
            <Link
              href="/"
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Dashboard
            </Link>
          </div>
        </div>
      </body>
    </html>
  );
}
