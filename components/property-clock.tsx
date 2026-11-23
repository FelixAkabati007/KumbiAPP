"use client";

import React, { memo, useEffect, useState, useSyncExternalStore } from "react";
import { CalendarDays, Clock3 } from "lucide-react";

interface PropertyTimeState {
  currentTime: Date | null;
  iso: string | null;
}

// Global singleton store so all clocks across the application tick in perfect sync
let globalTime: Date | null = null;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((listener) => {
    listener();
  });
}

let syncTimer: number | null = null;
let tickTimer: number | null = null;
let isStarted = false;

async function fetchAuthoritativeTime() {
  try {
    const res = await fetch("/api/system/time", { cache: "no-store" });
    if (!res.ok) return;
    const data = (await res.json()) as { iso?: string };
    if (data.iso) {
      globalTime = new Date(data.iso);
      notify();
    }
  } catch {
    // Keep last trusted time if API is unreachable
  }
}

function startGlobalClock() {
  if (isStarted) return;
  isStarted = true;

  void fetchAuthoritativeTime();

  if (tickTimer === null) {
    tickTimer = window.setInterval(() => {
      if (globalTime) {
        globalTime = new Date(globalTime.getTime() + 1000);
      } else {
        globalTime = new Date();
      }
      notify();
    }, 1000);
  }

  if (syncTimer === null) {
    syncTimer = window.setInterval(() => {
      void fetchAuthoritativeTime();
    }, 30_000);
  }

  const handleVisibilityChange = () => {
    if (document.hidden) {
      if (tickTimer !== null) clearInterval(tickTimer);
      if (syncTimer !== null) clearInterval(syncTimer);
      tickTimer = null;
      syncTimer = null;
    } else {
      if (tickTimer === null) {
        tickTimer = window.setInterval(() => {
          if (globalTime) {
            globalTime = new Date(globalTime.getTime() + 1000);
          } else {
            globalTime = new Date();
          }
          notify();
        }, 1000);
      }
      if (syncTimer === null) {
        syncTimer = window.setInterval(() => {
          void fetchAuthoritativeTime();
        }, 30_000);
      }
      void fetchAuthoritativeTime();
    }
  };

  document.addEventListener("visibilitychange", handleVisibilityChange);
}

function subscribe(callback: () => void) {
  listeners.add(callback);
  if (!isStarted && typeof window !== "undefined") {
    startGlobalClock();
  }
  return () => {
    listeners.delete(callback);
  };
}

function getSnapshot() {
  return globalTime;
}

function getServerSnapshot() {
  return null;
}

export function usePropertyTime() {
  const currentTime = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const formattedTime = currentTime
    ? new Intl.DateTimeFormat("en-GH", {
        timeZone: "Africa/Accra",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: true,
      }).format(currentTime)
    : "—";

  const [clockTime = "—", clockPeriod = ""] = formattedTime.split(" ");

  const formattedDate = currentTime
    ? new Intl.DateTimeFormat("en-GH", {
        timeZone: "Africa/Accra",
        weekday: "short",
        day: "numeric",
        month: "short",
        year: "numeric",
      }).format(currentTime)
    : "—";

  return {
    currentTime,
    formattedTime,
    clockTime,
    clockPeriod,
    formattedDate,
    isReady: Boolean(currentTime),
  };
}

export interface PropertyClockProps {
  compact?: boolean;
  className?: string;
  showDate?: boolean;
}

export const PropertyClock = memo(function PropertyClock({
  compact = false,
  className = "",
  showDate = true,
}: PropertyClockProps) {
  const { clockTime, clockPeriod, formattedDate } = usePropertyTime();

  if (compact) {
    return (
      <div
        className={`flex items-center gap-1.5 rounded-full border border-emerald-300 bg-emerald-100/80 px-2.5 py-1 shadow-sm dark:border-emerald-700 dark:bg-emerald-950/40 ${className}`}
        aria-label={`Property Accra time ${clockTime} ${clockPeriod}, date ${formattedDate}`}
        title={`Property Time (Accra): ${formattedDate} ${clockTime} ${clockPeriod}`}
        suppressHydrationWarning
      >
        <Clock3
          className="h-3.5 w-3.5 shrink-0 text-emerald-700 dark:text-emerald-300"
          aria-hidden="true"
        />
        <span
          className="font-mono text-xs font-bold tracking-wider tabular-nums text-emerald-950 dark:text-emerald-100"
          suppressHydrationWarning
        >
          {clockTime}
        </span>
        <span
          className="font-mono text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300"
          suppressHydrationWarning
        >
          {clockPeriod}
        </span>
      </div>
    );
  }

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      {showDate && (
        <div
          className="flex items-center gap-2 rounded-full border border-emerald-300 bg-emerald-100/80 px-3 py-2 shadow-sm dark:border-emerald-700 dark:bg-emerald-950/40"
          aria-label={`Current Accra date ${formattedDate}`}
          suppressHydrationWarning
        >
          <CalendarDays
            className="h-4 w-4 text-emerald-700 dark:text-emerald-300"
            aria-hidden="true"
          />
          <span
            className="text-sm font-semibold tracking-tight text-emerald-950 dark:text-emerald-100"
            suppressHydrationWarning
          >
            {formattedDate}
          </span>
        </div>
      )}
      <div
        className="flex items-center gap-2 rounded-full border border-emerald-300 bg-emerald-100/80 px-3 py-2 shadow-sm dark:border-emerald-700 dark:bg-emerald-950/40"
        aria-label={`Current Accra time ${clockTime} ${clockPeriod}`}
        suppressHydrationWarning
      >
        <Clock3
          className="h-4 w-4 text-emerald-700 dark:text-emerald-300"
          aria-hidden="true"
        />
        <span
          className="font-mono text-base font-bold tracking-wider tabular-nums text-emerald-950 dark:text-emerald-100"
          suppressHydrationWarning
        >
          {clockTime}
        </span>
        <span
          className="font-mono text-xs font-bold uppercase tracking-widest text-emerald-700 dark:text-emerald-300"
          suppressHydrationWarning
        >
          {clockPeriod}
        </span>
      </div>
    </div>
  );
});

export const AccraClock = PropertyClock;
