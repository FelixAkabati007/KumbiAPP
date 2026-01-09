import type React from "react";
import { Suspense } from "react";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeController } from "@/components/theme/theme-controller";
import { SettingsProvider } from "@/components/settings-provider";
import { IntegrationProvider } from "@/components/integration-provider";
import { ReceiptSettingsProvider } from "@/components/receipt-settings-provider";
import { Toaster } from "@/components/ui/toaster";
import { AuthProvider } from "@/components/auth-provider";
import ErrorBoundary from "@/components/error-boundary";
import { GlobalErrorHandler } from "@/components/global-error-handler";
import { LoadingProvider } from "@/components/loading-provider";
import { SystemSyncListener } from "@/components/system-sync-listener";

// Defensive check for broken localStorage in SSR environment
if (
  typeof global !== "undefined" &&
  typeof (globalThis as unknown as { localStorage?: unknown }).localStorage !==
    "undefined" &&
  typeof (
    (globalThis as unknown as { localStorage?: { getItem?: unknown } })
      .localStorage?.getItem
  ) !== "function"
) {
  try {
    // If localStorage is defined but broken (no getItem), remove it so libraries
    // like next-themes fall back to safe behavior instead of crashing.
    delete (globalThis as unknown as { localStorage?: unknown }).localStorage;
  } catch (e) {
    console.warn("Failed to patch broken localStorage:", e);
  }
}

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Kumbisaly Heritage Restaurant POS",
  description: "Point of Sale system for Kumbisaly Heritage Restaurant",
  generator: "v0.dev",
  icons: {
    icon: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
      </head>
      <body className={inter.className}>
        <AuthProvider>
          <GlobalErrorHandler />
          <SystemSyncListener />
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
          >
            <ThemeController />
            <Suspense>
              <LoadingProvider>
                <SettingsProvider>
                  <IntegrationProvider>
                    <ReceiptSettingsProvider>
                      <ErrorBoundary>
                        {children}
                        <Toaster />
                      </ErrorBoundary>
                    </ReceiptSettingsProvider>
                  </IntegrationProvider>
                </SettingsProvider>
              </LoadingProvider>
            </Suspense>
          </ThemeProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
