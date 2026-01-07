"use client";

import { useEffect } from "react";
import { setupGlobalErrorHandler } from "@/lib/error-handler";
import { features } from "@/lib/env";

export function GlobalErrorHandler() {
  useEffect(() => {
    setupGlobalErrorHandler();
    if (typeof window !== "undefined" && !features.debugLogs) {
      const noop = () => {};
      try {
        console.debug = noop;
        console.info = noop;
        console.log = noop;
      } catch {}
    }
  }, []);
  return null;
}
