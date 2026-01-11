"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useSystemSync } from "@/hooks/use-system-sync";
import { useToast } from "@/hooks/use-toast";

export function SystemSyncListener() {
  const router = useRouter();
  const { versions } = useSystemSync();
  const prevVersions = useRef<Record<string, string>>({});
  const { toast } = useToast();

  useEffect(() => {
    // Skip the first run (initial load)
    if (Object.keys(prevVersions.current).length === 0 && Object.keys(versions).length > 0) {
      prevVersions.current = versions;
      return;
    }

    const changes: string[] = [];

    // Check for changes
    Object.keys(versions).forEach((key) => {
      if (prevVersions.current[key] && prevVersions.current[key] !== versions[key]) {
        changes.push(key);
      }
    });

    if (changes.length > 0) {
      // console.log("System sync detected changes:", changes);
      
      // Update ref
      prevVersions.current = versions;

      // Trigger a soft refresh of the current route to fetch latest server data
      router.refresh();

      // Optional: Notify user
      if (changes.includes("settings") || changes.includes("global")) {
        toast({
          title: "System Updated",
          description: "New configuration applied.",
        });
      } else if (changes.includes("permissions")) {
        toast({
          title: "Permissions Updated",
          description: "Your access rights may have changed.",
        });
      }
    }
  }, [versions, router, toast]);

  return null; // This component doesn't render anything
}
