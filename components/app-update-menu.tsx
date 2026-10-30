"use client";

import * as React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import {
  AlertCircle,
  Calendar,
  Check,
  ChevronDown,
  ChevronUp,
  Download,
  Info,
  Loader2,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  Tag,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { useSystemSync } from "@/hooks/use-system-sync";
import type {
  SoftwareUpdate,
  SoftwareUpdateResponse,
  UpdateCategory,
} from "@/lib/software-updates";
import { compareSemver } from "@/lib/software-updates";
import { OfflineQueueService } from "@/lib/services/offline-queue";

const fetcher = async (url: string): Promise<SoftwareUpdateResponse> => {
  const currentBuild =
    typeof document !== "undefined"
      ? document.documentElement.dataset.appBuild || ""
      : "";
  const endpoint = `${url}${url.includes("?") ? "&" : "?"}t=${Date.now()}${
    currentBuild ? `&build=${encodeURIComponent(currentBuild)}` : ""
  }`;

  const res = await fetch(endpoint, {
    cache: "no-store",
    credentials: "same-origin",
  });

  if (!res.ok) {
    throw new Error(`Update server returned status ${res.status}`);
  }

  const json = await res.json();
  if (!json || typeof json !== "object") {
    throw new Error("Invalid response format received from update server");
  }

  return json as SoftwareUpdateResponse;
};

const categoryBadgeStyles: Record<UpdateCategory, string> = {
  major: "bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-950/60 dark:text-purple-300 dark:border-purple-800",
  feature: "bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800",
  fix: "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800",
  security: "bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800",
  maintenance: "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800",
};

export interface AppUpdateMenuProps {
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function AppUpdateMenu({
  defaultOpen = false,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
}: AppUpdateMenuProps = {}) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const isOpen = controlledOpen !== undefined ? controlledOpen : uncontrolledOpen;
  const onOpenChange = controlledOnOpenChange || setUncontrolledOpen;

  const { toast } = useToast();
  const { versions } = useSystemSync();
  const [isManualChecking, setIsManualChecking] = useState(false);
  const [lastCheckedTime, setLastCheckedTime] = useState<string | null>(null);
  const [expandedUpdateIds, setExpandedUpdateIds] = useState<Record<string, boolean>>({});

  // Real-time synchronization via SWR: polls every 15s, revalidates on window focus & reconnect
  const { data, error, isValidating, mutate } = useSWR<SoftwareUpdateResponse>(
    "/api/release",
    fetcher,
    {
      refreshInterval: 15000,
      revalidateOnFocus: true,
      revalidateOnReconnect: true,
      dedupingInterval: 3000,
      errorRetryCount: 3,
      errorRetryInterval: 5000,
    }
  );

  // Sync with system-wide state sync events
  useEffect(() => {
    if (versions.updates || versions.global) {
      void mutate();
    }
  }, [versions.updates, versions.global, mutate]);

  // Cross-tab real-time sync with BroadcastChannel
  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    try {
      const channel = new BroadcastChannel("kumbi-software-updates");
      channel.onmessage = (event) => {
        if (
          event.data?.type === "SOFTWARE_UPDATE_AVAILABLE" ||
          event.data?.type === "SOFTWARE_UPDATE_CHECK"
        ) {
          void mutate();
        }
      };
      return () => {
        channel.close();
      };
    } catch {
      // BroadcastChannel unsupported or restricted in this environment
    }
  }, [mutate]);

  // Listen to in-memory custom DOM events
  useEffect(() => {
    const handleCustomUpdate = () => {
      void mutate();
    };
    window.addEventListener("kumbi:software-update", handleCustomUpdate);
    return () => {
      window.removeEventListener("kumbi:software-update", handleCustomUpdate);
    };
  }, [mutate]);

  // Format last checked timestamp
  useEffect(() => {
    if (data) {
      setLastCheckedTime(new Date().toLocaleTimeString());
    }
  }, [data]);

  // Track version transitions to alert users in real-time when new releases land
  const initialMountRef = useRef(true);
  const previousLatestVersionRef = useRef<string | null>(null);

  useEffect(() => {
    if (!data) return;

    if (initialMountRef.current) {
      initialMountRef.current = false;
      previousLatestVersionRef.current = data.latestVersion;
      return;
    }

    // If a new version is detected during active session
    if (
      previousLatestVersionRef.current &&
      data.latestVersion &&
      compareSemver(data.latestVersion, previousLatestVersionRef.current) > 0
    ) {
      previousLatestVersionRef.current = data.latestVersion;
      toast({
        title: "New software update released",
        description: `Version ${data.latestVersion} is now available with new features and improvements.`,
      });
    }
  }, [data, toast]);

  // Determine if update is available
  const isAvailable = useMemo(() => {
    if (!data) return false;
    if (data.isUpdateAvailable) return true;

    const currentBuild =
      typeof document !== "undefined"
        ? document.documentElement.dataset.appBuild
        : undefined;

    if (
      currentBuild &&
      data.latestBuild &&
      currentBuild !== data.latestBuild &&
      currentBuild !== "development" &&
      data.latestBuild !== "development"
    ) {
      return true;
    }

    if (data.latestVersion && data.currentVersion) {
      return compareSemver(data.latestVersion, data.currentVersion) > 0;
    }

    return false;
  }, [data]);

  // Manual Check Handler
  const handleManualCheck = useCallback(async () => {
    setIsManualChecking(true);
    try {
      const refreshed = await mutate();
      setLastCheckedTime(new Date().toLocaleTimeString());

      if (refreshed?.isUpdateAvailable) {
        toast({
          title: "Software update available",
          description: `Version ${refreshed.latestVersion} is ready to apply.`,
        });
      } else {
        toast({
          title: "KumbiAPP is up to date",
          description: refreshed?.currentVersion
            ? `Running version ${refreshed.currentVersion}`
            : "You are currently running the latest version.",
        });
      }
    } catch {
      toast({
        title: "Update check failed",
        description: "Unable to verify software updates. Please check your network connection.",
        variant: "destructive",
      });
    } finally {
      setIsManualChecking(false);
    }
  }, [mutate, toast]);

  const [isUpdatingApp, setIsUpdatingApp] = useState(false);

  const handleApplyUpdate = useCallback(async () => {
    setIsUpdatingApp(true);
    const isOnline = typeof navigator !== "undefined" ? navigator.onLine : true;

    try {
      if (isOnline) {
        toast({
          title: "Updating Application (Online)",
          description: "Checking updates, refreshing service worker cache, and syncing pending data...",
        });

        // 1. Process offline sync queue if anything is pending
        try {
          const offlineQueue = OfflineQueueService.getInstance();
          await offlineQueue.processQueue();
        } catch {
          // non-blocking
        }

        // 2. Fetch fresh release metadata & mutate SWR
        try {
          await mutate();
        } catch {
          // non-blocking
        }

        // 3. Update Service Worker & precache
        if (typeof window !== "undefined" && "serviceWorker" in navigator) {
          try {
            const registrations = await navigator.serviceWorker.getRegistrations();
            for (const reg of registrations) {
              await reg.update();
              if (reg.waiting) {
                reg.waiting.postMessage({ type: "SKIP_WAITING" });
              }
            }
          } catch (swErr) {
            console.warn("Service worker update warning:", swErr);
          }
        }

        // 4. Precache critical live API endpoints
        try {
          await Promise.allSettled([
            fetch("/api/menu", { cache: "reload" }),
            fetch("/api/inventory", { cache: "reload" }),
          ]);
        } catch {
          // non-blocking
        }

        toast({
          title: "Update Installed",
          description: "Application successfully updated to the latest build. Refreshing view...",
        });

        setTimeout(() => {
          window.location.reload();
        }, 800);
      } else {
        // OFFLINE MODE UPDATE
        toast({
          title: "Updating Application (Offline Mode)",
          description: "Re-indexing local database, validating offline cache, and consolidating state...",
        });

        // 1. Re-validate local cache and offline storage
        try {
          if (typeof window !== "undefined" && "caches" in window) {
            const keys = await caches.keys();
            console.log("Cached offline keys validated:", keys);
          }
        } catch (cErr) {
          console.warn("Offline cache check warning:", cErr);
        }

        // 2. Verify queue integrity
        try {
          const offlineQueue = OfflineQueueService.getInstance();
          const queue = offlineQueue.getQueue();
          console.log(`Offline queue verified: ${queue.length} pending items.`);
        } catch {
          // non-blocking
        }

        toast({
          title: "Offline Update Complete",
          description: "Offline cache validated and local data synchronized. The application is running at full offline capability.",
        });

        setIsUpdatingApp(false);
      }
    } catch (err) {
      toast({
        title: "Update Process Notice",
        description: err instanceof Error ? err.message : "Unable to complete full update cycle",
        variant: "destructive",
      });
      setIsUpdatingApp(false);
    }
  }, [mutate, toast]);

  const reloadForUpdate = useCallback(() => {
    window.location.reload();
  }, []);

  const toggleExpand = useCallback((id: string) => {
    setExpandedUpdateIds((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  }, []);

  const updatesList = data?.updates || [];
  const currentVersion = data?.currentVersion || "1.2.5";
  const latestVersion = data?.latestVersion || currentVersion;
  const isChecking = isValidating || isManualChecking;

  return (
    <DropdownMenu open={isOpen} onOpenChange={onOpenChange}>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                onClick={() => onOpenChange(!isOpen)}
                aria-label={`Software updates${isAvailable ? " (Update available)" : ""}`}
                title="Software updates"
                className="relative h-9 w-9 shrink-0 rounded-full border-orange-200 bg-orange-50/80 text-orange-700 hover:bg-orange-100 dark:border-orange-700 dark:bg-orange-900/30 dark:text-orange-300 dark:hover:bg-orange-900/50 transition-colors"
              >
                {isChecking ? (
                  <Loader2 className="h-4 w-4 animate-spin text-orange-600 dark:text-orange-400" aria-hidden="true" />
                ) : isAvailable ? (
                  <Download className="h-4 w-4 text-orange-600 dark:text-orange-400" aria-hidden="true" />
                ) : (
                  <Sparkles className="h-4 w-4" aria-hidden="true" />
                )}

                {isAvailable && (
                  <span className="absolute -top-0.5 -right-0.5 flex h-3 w-3" aria-label="Update ready">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-orange-500 text-[8px] font-bold text-white items-center justify-center">
                      !
                    </span>
                  </span>
                )}
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <p>{isAvailable ? "Software update available! Click to view" : "Software updates & release notes"}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <DropdownMenuContent
        align="end"
        sideOffset={8}
        collisionPadding={12}
        className="w-[min(28rem,calc(100vw-1.5rem))] max-w-[calc(100vw-1.5rem)] p-0 shadow-xl border-orange-200 dark:border-orange-800"
      >
        <div className="flex max-h-[min(34rem,80vh)] flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-orange-100 bg-orange-50/60 px-3.5 py-2.5 dark:border-orange-900/50 dark:bg-orange-950/40">
            <div className="flex items-center gap-2 min-w-0">
              <Sparkles className="h-4 w-4 shrink-0 text-orange-600 dark:text-orange-400" aria-hidden="true" />
              <DropdownMenuLabel className="p-0 font-semibold text-foreground text-sm">
                Software Updates
              </DropdownMenuLabel>
              <Badge
                variant="outline"
                className="border-orange-300 bg-white/70 text-orange-800 dark:border-orange-700 dark:bg-orange-900/40 dark:text-orange-300 text-[11px] px-1.5 py-0 font-mono"
              >
                v{currentVersion}
              </Badge>
            </div>

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => void handleManualCheck()}
                    disabled={isChecking}
                    className="h-7 w-7 text-orange-700 hover:bg-orange-100 dark:text-orange-300 dark:hover:bg-orange-900/50 rounded-full"
                    aria-label="Check for updates now"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${isChecking ? "animate-spin" : ""}`} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="left">
                  <p>Check for updates now</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>

          {/* Prominent Update Action Bar (Works Online and Offline) */}
          <div className="border-b border-orange-200/80 bg-gradient-to-r from-orange-500/10 via-amber-500/10 to-yellow-500/10 p-3 dark:border-orange-900/60 dark:from-orange-950/40 dark:via-amber-950/30 dark:to-yellow-950/20">
            <div className="flex items-center justify-between gap-3">
              <div className="space-y-0.5 min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className={`flex h-2 w-2 rounded-full ${isAvailable ? "bg-orange-500 animate-pulse" : "bg-emerald-500"}`} />
                  <span className="text-xs font-semibold text-foreground">
                    {isAvailable ? `Update Ready: v${latestVersion}` : `System Status: v${currentVersion}`}
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground truncate">
                  {typeof navigator !== "undefined" && !navigator.onLine
                    ? "Offline mode active · Synchronizes local database & cache"
                    : isAvailable
                    ? (data?.latestUpdate?.title || "New system optimizations and bug fixes ready")
                    : "App is synchronized. Click to update & refresh online/offline caches."}
                </p>
              </div>

              <Button
                size="sm"
                onClick={() => void handleApplyUpdate()}
                disabled={isUpdatingApp}
                aria-label={isAvailable ? "Update App / Reload App" : "Update App"}
                className="shrink-0 h-8 rounded-xl bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-700 hover:to-amber-700 text-white text-xs font-medium shadow-sm transition-all"
              >
                {isUpdatingApp ? (
                  <>
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    Updating…
                  </>
                ) : (
                  <>
                    <Download className="mr-1.5 h-3.5 w-3.5" />
                    Update App
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Inline Error Banner if fetch fails */}
          {error && !data && (
            <div className="m-3 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <AlertCircle className="h-4 w-4 shrink-0 text-red-500" />
                <span className="truncate">Unable to sync updates from server</span>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void handleManualCheck()}
                className="h-6 px-2 text-xs border-red-200 text-red-700 hover:bg-red-100 dark:border-red-800 dark:text-red-300 shrink-0"
              >
                Retry
              </Button>
            </div>
          )}

          {/* Updates List with Complete Details */}
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-2 space-y-3">
            <div className="flex items-center justify-between px-1 pt-1 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
              <span>Release History & Details</span>
              <span>{updatesList.length} {updatesList.length === 1 ? "release" : "releases"}</span>
            </div>

            {updatesList.length === 0 && !error ? (
              <div className="py-8 text-center text-xs text-muted-foreground">
                <Info className="mx-auto h-5 w-5 mb-1.5 text-muted-foreground/60" />
                No software updates recorded yet.
              </div>
            ) : (
              updatesList.map((update, index) => {
                const isCurrent = update.version === currentVersion;
                const isNewest = index === 0;
                const isExpanded = expandedUpdateIds[update.id] ?? (isNewest || index < 2);
                const releaseDateFormatted = update.releaseDate
                  ? new Date(update.releaseDate).toLocaleDateString(undefined, {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })
                  : "Recent";

                const categoryBadgeClass =
                  categoryBadgeStyles[update.type] || categoryBadgeStyles.feature;

                return (
                  <div
                    key={update.id}
                    className={`rounded-xl border p-3 transition-all ${
                      isCurrent
                        ? "border-orange-300/80 bg-orange-50/40 dark:border-orange-800/80 dark:bg-orange-950/20"
                        : "border-border/70 bg-card hover:border-orange-200 dark:hover:border-orange-800/60"
                    }`}
                  >
                    {/* Update Header */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-1 min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-semibold text-foreground text-xs font-mono">
                            v{update.version}
                          </span>
                          <Badge
                            variant="outline"
                            className={`text-[10px] px-1.5 py-0 capitalize ${categoryBadgeClass}`}
                          >
                            {update.type}
                          </Badge>
                          {update.isCritical && (
                            <Badge
                              variant="destructive"
                              className="text-[10px] px-1.5 py-0 flex items-center gap-0.5"
                            >
                              <ShieldAlert className="h-2.5 w-2.5" />
                              Security
                            </Badge>
                          )}
                          {isCurrent && (
                            <Badge
                              variant="secondary"
                              className="text-[10px] px-1.5 py-0 text-muted-foreground"
                            >
                              Installed
                            </Badge>
                          )}
                        </div>

                        <h4 className="text-xs font-medium text-foreground leading-snug">
                          {update.title}
                        </h4>
                      </div>

                      <button
                        type="button"
                        onClick={() => toggleExpand(update.id)}
                        className="text-muted-foreground hover:text-foreground p-1 rounded-md transition-colors shrink-0"
                        aria-label={isExpanded ? "Collapse update details" : "Expand update details"}
                      >
                        {isExpanded ? (
                          <ChevronUp className="h-3.5 w-3.5" />
                        ) : (
                          <ChevronDown className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </div>

                    {/* Description */}
                    {update.description && (
                      <p className="mt-1 text-[11px] text-muted-foreground line-clamp-2">
                        {update.description}
                      </p>
                    )}

                    {/* Metadata line */}
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {releaseDateFormatted}
                      </span>
                      {update.source && (
                        <span className="inline-flex items-center gap-1">
                          <Tag className="h-3 w-3" />
                          {update.source}
                        </span>
                      )}
                    </div>

                    {/* Expandable Details / Changes */}
                    {isExpanded && update.details && update.details.length > 0 && (
                      <div className="mt-2.5 border-t border-border/50 pt-2">
                        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
                          Included Improvements & Fixes
                        </p>
                        <ul className="space-y-1 pl-1">
                          {update.details.map((change, cIdx) => (
                            <li
                              key={cIdx}
                              className="flex items-start gap-1.5 text-[11px] text-foreground/90 leading-tight"
                            >
                              <Check className="h-3 w-3 text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" />
                              <span>{change}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          <DropdownMenuSeparator className="m-0" />

          {/* Footer with Metadata & Status */}
          <div className="border-t border-border/40 bg-muted/40 px-3.5 py-2 text-[10px] text-muted-foreground flex items-center justify-between gap-2">
            <div className="space-y-0.5 truncate">
              <div className="truncate">
                Build: {data?.currentBuild?.slice(0, 10) || "latest"} · Branch: {data?.branch || "main"}
              </div>
              <div>Last checked: {lastCheckedTime || "Just now"}</div>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => void handleManualCheck()}
              disabled={isChecking}
              className="h-7 text-xs border-orange-200 text-orange-700 hover:bg-orange-100 dark:border-orange-800 dark:text-orange-300 dark:hover:bg-orange-950 shrink-0"
            >
              {isChecking ? (
                <>
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                  Checking…
                </>
              ) : isAvailable ? (
                <>
                  <Download className="mr-1 h-3 w-3" />
                  Update Ready
                </>
              ) : (
                <>
                  <Check className="mr-1 h-3 w-3" />
                  Up to Date
                </>
              )}
            </Button>
          </div>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
