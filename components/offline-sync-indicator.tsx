"use client";

import React, { useEffect, useState, useTransition } from "react";
import { Cloud, RefreshCw, Wifi, WifiOff, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  getOfflineQueueStats,
  subscribeOfflineQueue,
  processOfflineQueue,
  clearAllQueues,
  type OfflineQueueStats,
  getQueuedOrders,
  getQueuedAttendance,
} from "@/lib/offline-storage";
import { toast } from "sonner";

export function OfflineSyncIndicator() {
  const [stats, setStats] = useState<OfflineQueueStats>(() => {
    if (typeof window !== "undefined") {
      return getOfflineQueueStats();
    }
    return {
      orders: 0,
      attendance: 0,
      mutations: 0,
      total: 0,
      isOnline: true,
      isSyncing: false,
    };
  });
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    // Initial stats and subscription
    const unsubscribe = subscribeOfflineQueue((newStats) => {
      setStats(newStats);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const handleManualSync = () => {
    if (!stats.isOnline) {
      toast.error("Cannot sync while device is offline.");
      return;
    }
    if (stats.total === 0) {
      toast.info("Local queue is already empty. All data is synchronized.");
      return;
    }

    startTransition(async () => {
      toast.info("Synchronizing local data with server...");
      try {
        const result = await processOfflineQueue();
        if (result.syncedOrders > 0 || result.syncedAttendance > 0 || result.syncedMutations > 0) {
          toast.success(
            `Synced: ${result.syncedOrders} orders, ${result.syncedAttendance} attendance punches, ${result.syncedMutations} mutations.`
          );
        } else if (result.failedCount > 0) {
          toast.error(`Sync failed for ${result.failedCount} items: ${result.errors[0] || "Unknown error"}`);
        } else {
          toast.info("All offline records are already up to date.");
        }
      } catch (err: unknown) {
        toast.error(`Sync error: ${err instanceof Error ? err.message : String(err)}`);
      }
    });
  };

  const handleClearQueue = () => {
    if (typeof window !== "undefined" && window.confirm("Are you sure you want to clear all un-synced offline records? Any queued sales or attendance will be lost.")) {
      clearAllQueues();
      toast.info("Local offline queue cleared.");
      setOpen(false);
    }
  };

  const isSyncing = stats.isSyncing || isPending;
  const queuedOrders = getQueuedOrders();
  const queuedAttendance = getQueuedAttendance();

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className={`relative h-9 w-9 rounded-full border transition-colors ${
                  !stats.isOnline
                    ? "border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
                    : stats.total > 0
                    ? "border-orange-300 bg-orange-50 text-orange-700 hover:bg-orange-100 dark:border-orange-700 dark:bg-orange-950/40 dark:text-orange-300"
                    : "border-orange-200/80 bg-white/70 text-orange-700 hover:bg-orange-100 dark:border-orange-800 dark:bg-gray-900/60 dark:text-orange-300"
                }`}
                aria-label={
                  !stats.isOnline
                    ? `Offline mode (${stats.total} queued items)`
                    : stats.total > 0
                    ? `${stats.total} items pending sync`
                    : "Network connected and synchronized"
                }
              >
                {isSyncing ? (
                  <RefreshCw className="h-4 w-4 animate-spin text-orange-600 dark:text-orange-400" />
                ) : !stats.isOnline ? (
                  <WifiOff className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                ) : stats.total > 0 ? (
                  <Cloud className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                ) : (
                  <Wifi className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                )}

                {/* Queue badge indicator */}
                {stats.total > 0 && !isSyncing && (
                  <span className="absolute -top-1 -right-1 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-orange-600 px-1 text-[10px] font-bold text-white shadow-sm dark:bg-orange-500">
                    {stats.total > 99 ? "99+" : stats.total}
                  </span>
                )}
                {!stats.isOnline && stats.total === 0 && (
                  <span className="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75"></span>
                    <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-amber-500"></span>
                  </span>
                )}
              </Button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent side="bottom" align="center" className="text-xs">
            {!stats.isOnline
              ? `Offline mode (${stats.total} queued)`
              : stats.total > 0
              ? `${stats.total} items queued locally`
              : "Connected (All data synced)"}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-[min(24rem,calc(100vw-2rem))] rounded-2xl border border-orange-200 bg-white/95 p-4 shadow-xl backdrop-blur-md dark:border-orange-800 dark:bg-gray-950/95"
      >
        <div className="space-y-4">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-orange-100 pb-3 dark:border-orange-900/60">
            <div className="flex items-center gap-2">
              <span
                className={`flex h-3 w-3 rounded-full ${
                  !stats.isOnline
                    ? "bg-amber-500"
                    : stats.total > 0
                    ? "bg-orange-500"
                    : "bg-emerald-500"
                }`}
              />
              <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                {!stats.isOnline ? "Offline Mode" : "Network & Local Sync"}
              </h3>
            </div>
            <Badge
              variant="outline"
              className={
                !stats.isOnline
                  ? "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-300"
                  : "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
              }
            >
              {!stats.isOnline ? "Disconnected" : "Connected"}
            </Badge>
          </div>

          {/* Description */}
          <p className="text-xs text-muted-foreground">
            {!stats.isOnline
              ? "Your device is currently disconnected from the internet. All new sales, attendance, and stock updates are being stored securely in local browser storage and will sync automatically when connectivity is restored."
              : stats.total > 0
              ? `${stats.total} operation(s) are stored locally in the offline queue waiting to sync to the central database.`
              : "All local transactions and operational data are fully synchronized with the cloud database."}
          </p>

          {/* Metrics Cards */}
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl border border-orange-100 bg-orange-50/50 p-2 dark:border-orange-900/40 dark:bg-orange-950/20">
              <span className="block text-lg font-bold text-orange-700 dark:text-orange-300">
                {stats.orders}
              </span>
              <span className="text-[11px] text-muted-foreground">Orders</span>
            </div>
            <div className="rounded-xl border border-orange-100 bg-orange-50/50 p-2 dark:border-orange-900/40 dark:bg-orange-950/20">
              <span className="block text-lg font-bold text-orange-700 dark:text-orange-300">
                {stats.attendance}
              </span>
              <span className="text-[11px] text-muted-foreground">Attendance</span>
            </div>
            <div className="rounded-xl border border-orange-100 bg-orange-50/50 p-2 dark:border-orange-900/40 dark:bg-orange-950/20">
              <span className="block text-lg font-bold text-orange-700 dark:text-orange-300">
                {stats.mutations}
              </span>
              <span className="text-[11px] text-muted-foreground">Updates</span>
            </div>
          </div>

          {/* Pending items preview list if any */}
          {stats.total > 0 && (
            <div className="max-h-40 space-y-2 overflow-y-auto rounded-xl border border-orange-100 bg-gray-50/50 p-2 text-xs dark:border-gray-800 dark:bg-gray-900/50">
              {queuedOrders.slice(0, 3).map((o) => (
                <div key={o.id} className="flex items-center justify-between border-b border-gray-200/50 pb-1 last:border-0 dark:border-gray-800">
                  <span className="font-medium text-gray-800 dark:text-gray-200">
                    Order #{o.orderNumber}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    GHS {Number(o.payload?.total || 0).toFixed(2)} ({o.status})
                  </span>
                </div>
              ))}
              {queuedAttendance.slice(0, 2).map((a) => (
                <div key={a.id} className="flex items-center justify-between border-b border-gray-200/50 pb-1 last:border-0 dark:border-gray-800">
                  <span className="font-medium text-gray-800 dark:text-gray-200">
                    Attendance: {a.payload.action}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {new Date(a.createdAt).toLocaleTimeString()}
                  </span>
                </div>
              ))}
              {stats.total > 5 && (
                <div className="text-center text-[10px] text-muted-foreground">
                  +{stats.total - 5} more queued item(s)
                </div>
              )}
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center gap-2 pt-1">
            <Button
              onClick={handleManualSync}
              disabled={isSyncing || !stats.isOnline || stats.total === 0}
              className="flex-1 rounded-xl bg-orange-600 font-medium text-white shadow-sm hover:bg-orange-700 disabled:opacity-50 dark:bg-orange-600 dark:hover:bg-orange-700"
              size="sm"
            >
              <RefreshCw className={`mr-2 h-3.5 w-3.5 ${isSyncing ? "animate-spin" : ""}`} />
              {isSyncing ? "Syncing Queue..." : "Sync Now"}
            </Button>

            {stats.total > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleClearQueue}
                className="rounded-xl border-red-200 text-red-600 hover:bg-red-50 dark:border-red-900/50 dark:text-red-400 dark:hover:bg-red-950/40"
                title="Discard offline records"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
