"use client";

import { useEffect } from "react";

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    // Register service worker for offline PWA support
    navigator.serviceWorker
      .register("/sw.js")
      .then((registration) => {
        // Immediately check for newer service worker version
        registration.update().catch(() => {});
        if (registration.waiting) {
          registration.waiting.postMessage({ type: "SKIP_WAITING" });
        }
      })
      .catch((err) => {
        // Progressive enhancement fallback: app operates cleanly even without SW
        console.warn("[SW] Service worker registration omitted or unsupported:", err);
      });
  }, []);

  return null;
}
