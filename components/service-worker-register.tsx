"use client";

import { useEffect } from "react";

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    // Register service worker for offline PWA support
    navigator.serviceWorker
      .register("/sw.js")
      .then((registration) => {
        // Trigger background check for service worker updates
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
