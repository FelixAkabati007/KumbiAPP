"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Download, Loader2, MoreVertical, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";

type UpdateState = "idle" | "checking" | "current" | "available";
type ReleaseInfo = { version?: string; build?: string; branch?: string; deploymentId?: string | null; commitUrl?: string | null; changes?: string[]; source?: string };

export function AppUpdateMenu() {
  const { toast } = useToast();
  const [state, setState] = useState<UpdateState>("idle");
  const [checkedAt, setCheckedAt] = useState<string | null>(null);
  const [release, setRelease] = useState<ReleaseInfo | null>(null);

  const checkForUpdates = useCallback(async () => {
    setState("checking");
    try {
      const response = await fetch(`/api/system/version?t=${Date.now()}`, { cache: "no-store", credentials: "same-origin" });
      if (!response.ok) throw new Error(`Version endpoint returned ${response.status}`);
      const latest = await response.json() as ReleaseInfo;
      setRelease(latest);
      const current = document.documentElement.dataset.appBuild;
      const isAvailable = Boolean(current && latest.build && current !== latest.build && latest.build !== "development");
      setState(isAvailable ? "available" : "current");
      setCheckedAt(new Date().toLocaleTimeString());

      if (isAvailable) {
        toast({ title: "Update available", description: "Reload KumbiAPP to use the latest features." });
      } else {
        toast({ title: "KumbiAPP is up to date", description: latest.version ? `Version ${latest.version}` : "You are running the latest available version." });
      }
    } catch {
      setState("idle");
      toast({ title: "Update check failed", description: "Please check your connection and try again.", variant: "destructive" });
    }
  }, [toast]);

  useEffect(() => {
    void checkForUpdates();
  }, [checkForUpdates]);

  const reloadForUpdate = () => {
    window.location.reload();
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          aria-label="Application updates"
          title="Application updates"
          className="relative h-9 w-9 shrink-0 rounded-full border-orange-200 bg-orange-50/80 text-orange-700 hover:bg-orange-100 dark:border-orange-700 dark:bg-orange-900/30 dark:text-orange-300 dark:hover:bg-orange-900/50"
        >
          <MoreVertical className="h-5 w-5" aria-hidden="true" />
          {state === "available" && <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-red-500 ring-2 ring-orange-50 dark:ring-orange-950" aria-label="Update available" />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>Software updates</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {state === "available" ? (
          <DropdownMenuItem onClick={reloadForUpdate}>
            <Download className="mr-2 h-4 w-4" />
            Reload for latest features
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem onClick={() => void checkForUpdates()} disabled={state === "checking"}>
            {state === "checking" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : state === "current" ? <Check className="mr-2 h-4 w-4" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            {state === "checking" ? "Checking for updates…" : "Check for updates"}
          </DropdownMenuItem>
        )}
        {release && (
          <div className="space-y-2 px-2 py-2 text-xs text-muted-foreground">
            <div className="font-medium text-foreground">{state === "available" ? "New changes available" : "Current release"}</div>
            <div>Version {release.version || "unknown"} · build {release.build?.slice(0, 12) || "unknown"}</div>
            <div>Branch: {release.branch || "unknown"}</div>
            <div>Source: {release.source || "deployment metadata"}</div>
            {release.commitUrl && <a className="text-orange-700 underline underline-offset-2 dark:text-orange-300" href={release.commitUrl} target="_blank" rel="noreferrer">View exact commit</a>}
            {release.changes && release.changes.length > 0 && <ul className="list-disc space-y-1 pl-4">{release.changes.map((change) => <li key={change}>{change}</li>)}</ul>}
          </div>
        )}
        {checkedAt && <p className="px-2 py-1 text-xs text-muted-foreground">Last checked {checkedAt}</p>}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
