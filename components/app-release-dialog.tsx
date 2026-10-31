"use client";

import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Sparkles,
  CheckCircle2,
  Calendar,
  Tag,
  History,
  Search,
  ChevronDown,
  ChevronUp,
  ShieldAlert,
  ArrowRight,
  PartyPopper,
} from "lucide-react";
import type { SoftwareUpdate, UpdateCategory } from "@/lib/software-updates";

interface AppReleaseDialogProps {
  isOpen: boolean;
  onClose: () => void;
  updates: SoftwareUpdate[];
  currentVersion: string;
  isJustUpdated?: boolean;
}

const categoryBadgeStyles: Record<UpdateCategory, string> = {
  major: "bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-950/60 dark:text-purple-300 dark:border-purple-800",
  feature: "bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800",
  fix: "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800",
  security: "bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800",
  maintenance: "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800",
};

export function AppReleaseDialog({
  isOpen,
  onClose,
  updates,
  currentVersion,
  isJustUpdated = false,
}: AppReleaseDialogProps) {
  const [activeTab, setActiveTab] = useState<"whatsNew" | "history">("whatsNew");
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});

  const latestUpdate = updates[0];

  const filteredUpdates = updates.filter((u) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      u.version.toLowerCase().includes(q) ||
      u.title.toLowerCase().includes(q) ||
      (u.description && u.description.toLowerCase().includes(q)) ||
      u.details.some((d) => d.toLowerCase().includes(q))
    );
  });

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl bg-white/95 dark:bg-gray-900/95 backdrop-blur-md border border-orange-200 dark:border-orange-800 rounded-3xl p-5 sm:p-6 shadow-2xl max-h-[88vh] flex flex-col">
        <DialogHeader className="shrink-0">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              {isJustUpdated ? (
                <Badge className="bg-gradient-to-r from-orange-500 to-amber-500 text-white font-semibold flex items-center gap-1">
                  <PartyPopper className="h-3.5 w-3.5" />
                  Update Successfully Installed!
                </Badge>
              ) : (
                <Badge
                  variant="outline"
                  className="bg-orange-50 dark:bg-orange-950/60 text-orange-800 dark:text-orange-300 border-orange-300"
                >
                  Software Release Center
                </Badge>
              )}
            </div>
            <span className="text-xs font-mono text-muted-foreground">
              Current: v{currentVersion}
            </span>
          </div>

          <DialogTitle className="text-xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2 mt-1">
            <Sparkles className="h-5 w-5 text-orange-600 dark:text-orange-400" />
            {isJustUpdated
              ? `What's New in KumbiAPP v${latestUpdate?.version || currentVersion}`
              : "Software Release History & Details"}
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Explore the latest feature enhancements, bug fixes, and historical changelogs across all releases.
          </DialogDescription>

          {/* Segmented Switcher */}
          <div className="flex items-center gap-2 pt-2 border-b border-orange-100 dark:border-orange-900/60 pb-2">
            <Button
              type="button"
              variant={activeTab === "whatsNew" ? "default" : "ghost"}
              size="sm"
              onClick={() => setActiveTab("whatsNew")}
              className={`h-8 text-xs rounded-xl font-medium ${
                activeTab === "whatsNew"
                  ? "bg-orange-500 hover:bg-orange-600 text-white shadow-sm"
                  : "text-gray-700 dark:text-gray-300"
              }`}
            >
              <Sparkles className="h-3.5 w-3.5 mr-1.5" />
              New Update Details (v{latestUpdate?.version || currentVersion})
            </Button>
            <Button
              type="button"
              variant={activeTab === "history" ? "default" : "ghost"}
              size="sm"
              onClick={() => setActiveTab("history")}
              className={`h-8 text-xs rounded-xl font-medium ${
                activeTab === "history"
                  ? "bg-orange-500 hover:bg-orange-600 text-white shadow-sm"
                  : "text-gray-700 dark:text-gray-300"
              }`}
            >
              <History className="h-3.5 w-3.5 mr-1.5" />
              Full Release History ({updates.length})
            </Button>
          </div>
        </DialogHeader>

        {/* Tab 1: What's New in This Release */}
        {activeTab === "whatsNew" && latestUpdate && (
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1 py-3 space-y-4 text-xs">
            {/* Release Highlight Card */}
            <div className="p-4 rounded-2xl bg-gradient-to-r from-orange-500/10 via-amber-500/10 to-yellow-500/10 dark:from-orange-950/40 dark:via-amber-950/30 dark:to-yellow-950/20 border border-orange-200 dark:border-orange-800 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-base font-bold text-gray-900 dark:text-gray-100 font-mono">
                    v{latestUpdate.version}
                  </span>
                  <Badge
                    variant="outline"
                    className={`text-[10px] px-2 py-0.5 capitalize ${
                      categoryBadgeStyles[latestUpdate.type] || categoryBadgeStyles.feature
                    }`}
                  >
                    {latestUpdate.type}
                  </Badge>
                  {latestUpdate.isCritical && (
                    <Badge variant="destructive" className="text-[10px] px-2 py-0.5 flex items-center gap-1">
                      <ShieldAlert className="h-3 w-3" />
                      Critical
                    </Badge>
                  )}
                </div>

                <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5" />
                    {new Date(latestUpdate.releaseDate).toLocaleDateString(undefined, {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                  {latestUpdate.source && (
                    <span className="flex items-center gap-1">
                      <Tag className="h-3.5 w-3.5" />
                      {latestUpdate.source}
                    </span>
                  )}
                </div>
              </div>

              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                {latestUpdate.title}
              </h3>
              {latestUpdate.description && (
                <p className="text-muted-foreground leading-relaxed">
                  {latestUpdate.description}
                </p>
              )}
            </div>

            {/* Detailed Feature List */}
            <div>
              <h4 className="font-semibold text-gray-900 dark:text-gray-100 uppercase tracking-wider text-[11px] mb-2 flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                Included Enhancements, Features & Fixes:
              </h4>

              <div className="space-y-2">
                {latestUpdate.details.map((detail, idx) => (
                  <div
                    key={idx}
                    className="flex items-start gap-2.5 p-2.5 rounded-xl bg-orange-50/40 dark:bg-orange-950/20 border border-orange-100 dark:border-orange-900/50"
                  >
                    <div className="p-1 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 mt-0.5 shrink-0">
                      <CheckCircle2 className="h-3 w-3" />
                    </div>
                    <span className="text-gray-800 dark:text-gray-200 text-xs leading-relaxed">
                      {detail}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Full Release History Timeline */}
        {activeTab === "history" && (
          <div className="min-h-0 flex-1 flex flex-col space-y-3 pt-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search releases (e.g. POS, discounts, receipt, room)..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 h-8 text-xs rounded-xl border-orange-200 dark:border-orange-800"
              />
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1 space-y-3 text-xs">
              {filteredUpdates.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground">
                  No matching releases found for &quot;{searchQuery}&quot;.
                </div>
              ) : (
                filteredUpdates.map((update, idx) => {
                  const isCurrent = update.version === currentVersion;
                  const isExpanded = expandedIds[update.id] ?? idx === 0;
                  const badgeClass =
                    categoryBadgeStyles[update.type] || categoryBadgeStyles.feature;

                  return (
                    <div
                      key={update.id}
                      className={`p-3.5 rounded-2xl border transition-all ${
                        isCurrent
                          ? "border-orange-300 bg-orange-50/40 dark:border-orange-800 dark:bg-orange-950/30"
                          : "border-border/70 bg-card hover:border-orange-200 dark:hover:border-orange-800"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="space-y-1 min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-bold text-gray-900 dark:text-gray-100 font-mono">
                              v{update.version}
                            </span>
                            <Badge variant="outline" className={`text-[10px] px-1.5 py-0 capitalize ${badgeClass}`}>
                              {update.type}
                            </Badge>
                            {isCurrent && (
                              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                                Installed
                              </Badge>
                            )}
                            <span className="text-[10px] text-muted-foreground ml-1">
                              {new Date(update.releaseDate).toLocaleDateString(undefined, {
                                year: "numeric",
                                month: "short",
                                day: "numeric",
                              })}
                            </span>
                          </div>

                          <h4 className="font-semibold text-gray-900 dark:text-gray-100 text-xs">
                            {update.title}
                          </h4>
                          {update.description && (
                            <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-2">
                              {update.description}
                            </p>
                          )}
                        </div>

                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => toggleExpand(update.id)}
                          className="h-7 w-7 text-muted-foreground hover:text-foreground shrink-0 rounded-lg"
                        >
                          {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </Button>
                      </div>

                      {isExpanded && update.details && update.details.length > 0 && (
                        <div className="mt-3 pt-2.5 border-t border-border/60 space-y-1.5">
                          {update.details.map((item, dIdx) => (
                            <div key={dIdx} className="flex items-start gap-2 text-[11px] text-gray-700 dark:text-gray-300">
                              <ArrowRight className="h-3 w-3 text-orange-500 mt-0.5 shrink-0" />
                              <span>{item}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        <DialogFooter className="pt-3 border-t border-orange-100 dark:border-orange-900/60 flex items-center justify-between">
          <p className="text-[11px] text-muted-foreground hidden sm:block">
            You can reopen release notes anytime via the updates menu in the header.
          </p>
          <Button
            type="button"
            size="sm"
            onClick={onClose}
            className="rounded-xl bg-gradient-to-r from-orange-500 via-amber-500 to-yellow-500 hover:from-orange-600 text-white text-xs font-medium shadow-sm px-4"
          >
            Got It
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
