"use client";

import { RefreshCw, Wifi, WifiOff } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export function useHotelLiveSync(onChange: () => Promise<void> | void) {
  const [connected, setConnected] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const callback = useRef(onChange);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const refreshInFlight = useRef<Promise<void> | null>(null);
  callback.current = onChange;

  const refresh = useCallback(async () => {
    if (refreshInFlight.current) return refreshInFlight.current;
    const run = (async () => {
      setRefreshing(true);
      try { await callback.current(); }
      finally { setRefreshing(false); refreshInFlight.current = null; }
    })();
    refreshInFlight.current = run;
    return run;
  }, []);

  const scheduleRefresh = useCallback(() => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => { void refresh(); }, 150);
  }, [refresh]);

  useEffect(() => {
    let source: EventSource | null = null;
    let retry = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const connect = () => {
      source = new EventSource("/api/hotels/events");
      source.addEventListener("connected", () => { retry = 0; setConnected(true); });
      source.addEventListener("ready", () => setConnected(true));
      source.addEventListener("change", () => { scheduleRefresh(); window.dispatchEvent(new Event("hotelDataUpdated")); });
      source.addEventListener("error", () => {
        setConnected(false); source?.close();
        const delay = Math.min(30000, 1000 * 2 ** retry++);
        timer = setTimeout(connect, delay);
      });
    };
    connect();
    return () => { if (timer) clearTimeout(timer); source?.close(); };
  }, [scheduleRefresh]);

  useEffect(() => () => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
  }, []);

  return { connected, refreshing, refresh };
}

export function LiveSyncToolbar({ connected, refreshing, onRefresh }: { connected: boolean; refreshing: boolean; onRefresh: () => void }) {
  return <div className="flex items-center gap-2">
    <Badge variant={connected ? "secondary" : "destructive"} className="hidden sm:inline-flex gap-1">
      {connected ? <Wifi data-icon="inline-start" /> : <WifiOff data-icon="inline-start" />}
      {connected ? "Live sync" : "Sync reconnecting"}
    </Badge>
    <Button type="button" variant="outline" onClick={onRefresh} disabled={refreshing} aria-label="Refresh hotel data">
      <RefreshCw data-icon="inline-start" className={refreshing ? "animate-spin" : undefined} />
      {refreshing ? "Refreshing" : "Refresh"}
    </Button>
  </div>;
}
