"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type RealtimeEvent = { topic: string; resource?: string | null; at?: string };
type RealtimeContextValue = { connected: boolean; lastEvent: RealtimeEvent | null; publish: (event: RealtimeEvent) => Promise<void> };

const RealtimeContext = createContext<RealtimeContextValue | null>(null);

export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [connected, setConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState<RealtimeEvent | null>(null);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleRefresh = useCallback(() => {
    if (refreshTimer.current) return;
    refreshTimer.current = setTimeout(() => { refreshTimer.current = null; router.refresh(); }, 150);
  }, [router]);

  useEffect(() => {
    let source: EventSource | null = null;
    let fallback: ReturnType<typeof setInterval> | null = null;
    let stopped = false;
    const connect = () => {
      source = new EventSource("/api/realtime");
      source.onopen = () => { setConnected(true); if (fallback) { clearInterval(fallback); fallback = null; } };
      const handleEvent = (message: MessageEvent<string>) => { const event = JSON.parse(message.data) as RealtimeEvent; setLastEvent(event); scheduleRefresh(); };
      source.onmessage = handleEvent;
      ["attendance.updated", "dashboard.updated", "hotel.updated", "pos.updated", "inventory.updated", "finance.updated", "staff.updated", "housekeeping.updated", "events.updated", "notifications.updated", "vip.updated"].forEach((topic) => source?.addEventListener(topic, handleEvent));
      source.onerror = () => { setConnected(false); source?.close(); if (!fallback) fallback = setInterval(() => { if (!document.hidden) router.refresh(); }, 15_000); if (!stopped) setTimeout(connect, 3_000); };
    };
    connect();
    return () => { stopped = true; source?.close(); if (fallback) clearInterval(fallback); if (refreshTimer.current) clearTimeout(refreshTimer.current); };
  }, [router, scheduleRefresh]);

  const publish = useCallback(async (event: RealtimeEvent) => { await fetch("/api/realtime", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(event) }); }, []);
  const value = useMemo(() => ({ connected, lastEvent, publish }), [connected, lastEvent, publish]);
  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}

export function useRealtime() {
  const value = useContext(RealtimeContext);
  if (!value) throw new Error("useRealtime must be used inside RealtimeProvider");
  return value;
}
