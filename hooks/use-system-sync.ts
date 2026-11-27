import { useState, useEffect, useRef } from "react";
import { useOptionalRealtime } from "@/components/realtime-provider";

interface SystemState {
  [key: string]: string;
}

const POLL_INTERVAL = 180_000; // SSE handles instant updates; 3m fallback conserves Neon compute hours

export function useSystemSync() {
  const realtime = useOptionalRealtime();
  const isSseConnected = Boolean(realtime?.connected);
  const [versions, setVersions] = useState<SystemState>({});
  const [lastChecked, setLastChecked] = useState<Date>(new Date());

  // Use a ref to keep track of mounted state to avoid setting state on unmounted component
  const isMounted = useRef(true);
  const sseConnectedRef = useRef(isSseConnected);
  sseConnectedRef.current = isSseConnected;

  useEffect(() => {
    isMounted.current = true;
    const controller = new AbortController();
    let requestInFlight = false;

    const fetchState = async (isIntervalPoll = false) => {
      if (requestInFlight || document.hidden || !navigator.onLine) return;
      // When SSE stream is connected, skip background timer polls so Neon can suspend when idle
      if (isIntervalPoll && sseConnectedRef.current) return;
      requestInFlight = true;
      try {
        const res = await fetch("/api/system/sync", { cache: "no-store", signal: controller.signal });
        if (res.ok) {
          const newState = await res.json();
          if (isMounted.current) {
            // Only update if versions actually changed to avoid unnecessary re-renders
            setVersions((prev) => {
              const hasChanges = Object.keys(newState).some(
                (key) => newState[key] !== prev[key]
              );
              return hasChanges ? newState : prev;
            });
            setLastChecked(new Date());
          }
        }
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") return;
      } finally {
        requestInFlight = false;
      }
    };

    const handleVisibilityChange = () => {
      if (!document.hidden) void fetchState(false);
    };
    const handleOnline = () => {
      void fetchState(false);
    };

    void fetchState(false);
    const interval = setInterval(() => {
      void fetchState(true);
    }, POLL_INTERVAL);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("online", handleOnline);

    return () => {
      isMounted.current = false;
      controller.abort();
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("online", handleOnline);
    };
  }, []);

  return { versions, lastChecked };
}
