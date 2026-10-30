"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { Sparkles, Loader2, AlertCircle, RotateCcw, CheckCircle2 } from "lucide-react";

interface SettingsSaveBarProps {
  saveState: "saved" | "unsaved" | "saving" | "error";
  onSave: () => void | Promise<void>;
  onDiscard?: () => void;
  disabled?: boolean;
}

export function SettingsSaveBar({
  saveState,
  onSave,
  onDiscard,
  disabled = false,
}: SettingsSaveBarProps) {
  // If state is saved, keep hidden or show minimal subtle indicator
  if (saveState === "saved") {
    return null;
  }

  return (
    <aside
      aria-label="Unsaved settings bar"
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-[95%] max-w-2xl animate-in fade-in slide-in-from-bottom-5 duration-300"
    >
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white/95 dark:bg-gray-900/95 backdrop-blur-md border-2 border-orange-400/80 dark:border-orange-500/80 p-3 sm:p-4 rounded-2xl shadow-2xl ring-4 ring-orange-500/10">
        <div className="flex items-center gap-2.5 w-full sm:w-auto">
          {saveState === "saving" ? (
            <Loader2 className="h-5 w-5 text-orange-600 animate-spin shrink-0" />
          ) : saveState === "error" ? (
            <AlertCircle className="h-5 w-5 text-destructive shrink-0" />
          ) : (
            <span className="relative flex h-3 w-3 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500"></span>
            </span>
          )}

          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
              {saveState === "saving"
                ? "Saving your settings..."
                : saveState === "error"
                ? "Failed to save settings"
                : "You have unsaved changes"}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 hidden xs:block">
              {saveState === "saving"
                ? "Synchronizing database and connected modules"
                : saveState === "error"
                ? "Please retry saving your changes"
                : "Apply changes to update POS, receipts, and system profiles"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          {onDiscard && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onDiscard}
              disabled={disabled || saveState === "saving"}
              className="text-xs rounded-xl border-orange-200 dark:border-orange-800 text-gray-700 dark:text-gray-300 hover:bg-orange-50 dark:hover:bg-orange-950/40"
            >
              <RotateCcw className="h-3.5 w-3.5 mr-1" />
              Discard
            </Button>
          )}

          <Button
            type="button"
            size="sm"
            onClick={onSave}
            disabled={disabled || saveState === "saving"}
            className="text-xs rounded-xl bg-gradient-to-r from-orange-500 via-amber-500 to-yellow-500 hover:from-orange-600 hover:via-amber-600 hover:to-yellow-600 text-white shadow-md relative overflow-hidden font-medium"
          >
            {saveState === "saving" ? (
              <>
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                Save Changes
              </>
            )}
          </Button>
        </div>
      </div>
    </aside>
  );
}
