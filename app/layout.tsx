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
import { ServiceWorkerRegister } from "@/components/service-worker-register";
import { InstallAppPrompt } from "@/components/install-app-prompt";
import { GlobalNotificationHost } from "@/components/global-notification-host";

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
  title: {
    default: "Kumbisaly Heritage Restaurant POS",
    template: "%s | Kumbisaly Heritage Restaurant POS",
  },
  manifest: "/manifest.webmanifest",
  description: "Point of Sale, inventory, finance, and operations management for Kumbisaly Heritage Restaurant.",
  generator: "v0.dev",
  icons: {
    icon: [
      { url: "/favicon.ico", type: "image/png", sizes: "64x64" },
      { url: "/favicon.ico", type: "image/png", sizes: "32x32" },
    ],
    apple: [{ url: "/favicon.ico", type: "image/png", sizes: "180x180" }],
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#f97316",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" translate="no" suppressHydrationWarning className="bg-background">
      <head>
        <link rel="icon" href="/favicon.ico" type="image/png" sizes="64x64" />
        <link rel="apple-touch-icon" href="/favicon.ico" sizes="180x180" />
      </head>
      <body className={inter.className} suppressHydrationWarning>
        <AuthProvider>
          <GlobalErrorHandler />
          <ServiceWorkerRegister />
          <SystemSyncListener />
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
          >
            <ThemeController />
            <Suspense fallback={<></>}>
              <LoadingProvider>
                <SettingsProvider>
                  <IntegrationProvider>
                    <ReceiptSettingsProvider>
                      <ErrorBoundary>
                        {children}
                        <GlobalNotificationHost />
                        <InstallAppPrompt />
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
