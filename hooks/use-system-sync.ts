import { useState, useEffect, useRef } from "react";

interface SystemState {
  [key: string]: string;
}

const POLL_INTERVAL = 10000; // 10 seconds

export function useSystemSync() {
  const [versions, setVersions] = useState<SystemState>({});
  const [lastChecked, setLastChecked] = useState<Date>(new Date());

  // Use a ref to keep track of mounted state to avoid setting state on unmounted component
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;

    const fetchState = async () => {
      try {
        const res = await fetch("/api/system/sync");
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
        // Suppress network errors during navigation/unmount
        if (error instanceof Error && error.message.includes("ERR_ABORTED")) {
          return;
        }
        // console.error("Failed to poll system state:", error);
      }
    };

    // Initial fetch
    fetchState();

    const interval = setInterval(fetchState, POLL_INTERVAL);

    return () => {
      isMounted.current = false;
      clearInterval(interval);
    };
  }, []);

  return { versions, lastChecked };
}
