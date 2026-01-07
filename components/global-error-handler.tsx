"use client";

import { useEffect } from "react";
import { setupGlobalErrorHandler } from "@/lib/error-handler";

export function GlobalErrorHandler() {
  useEffect(() => {
    setupGlobalErrorHandler();
  }, []);
  return null;
}
