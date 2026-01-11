"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

interface SyncEvent {
  id: string;
  event_type: string;
  payload: any;
  created_at: string;
}

export function useSync(intervalMs = 5000) {
  const [lastSyncTime, setLastSyncTime] = useState<string>(new Date().toISOString());
  const router = useRouter();
  
  // Use a ref to track the last sync time to avoid closure staleness in interval
  const lastSyncTimeRef = useRef(lastSyncTime);
  
  useEffect(() => {
    lastSyncTimeRef.current = lastSyncTime;
  }, [lastSyncTime]);

  useEffect(() => {
    const poll = async () => {
      try {
        const res = await fetch(`/api/sync?since=${lastSyncTimeRef.current}`);
        if (!res.ok) return;

        const data = await res.json();
        
        if (data.events && data.events.length > 0) {
          // console.log("Sync events received:", data.events);
          
          // Process events
          data.events.forEach((event: SyncEvent) => {
            handleEvent(event, router);
          });
          
          // Update timestamp to the latest event or server time
          // Using server time from response is safer
          setLastSyncTime(data.timestamp);
        }
      } catch (error) {
        // Silent fail for polling
        // console.error("Sync polling failed:", error);
      }
    };

    const interval = setInterval(poll, intervalMs);
    return () => clearInterval(interval);
  }, [intervalMs, router]);
}

function handleEvent(event: SyncEvent, router: any) {
  switch (event.event_type) {
    case "SETTINGS_UPDATE":
      toast.info("System settings updated by administrator.");
      router.refresh(); // Reload server components
      break;
    case "USER_UPDATE":
      toast.info("User data updated.");
      router.refresh(); 
      break;
    default:
      break;
  }
}
