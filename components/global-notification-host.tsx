"use client";

import { useEffect, useRef, useState } from "react";
import type { PointerEvent } from "react";
import { Grip } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { NotificationBell } from "@/components/notification-bell";

const defaultPosition = { x: 16, y: 16 };

export function GlobalNotificationHost() {
  const { user } = useAuth();
  const [position, setPosition] = useState(defaultPosition);
  const dragOffset = useRef({ x: 0, y: 0 });
  const isDragging = useRef(false);

  useEffect(() => {
    const saved = window.sessionStorage.getItem("notification-button-position");
    if (!saved) return;
    try {
      const parsed = JSON.parse(saved);
      if (typeof parsed.x === "number" && typeof parsed.y === "number") setPosition(parsed);
    } catch {
      window.sessionStorage.removeItem("notification-button-position");
    }
  }, []);

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    dragOffset.current = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    isDragging.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!isDragging.current) return;
    const size = event.currentTarget.getBoundingClientRect();
    const x = Math.max(8, Math.min(window.innerWidth - size.width - 8, event.clientX - dragOffset.current.x));
    const y = Math.max(8, Math.min(window.innerHeight - size.height - 8, event.clientY - dragOffset.current.y));
    const next = { x, y };
    setPosition(next);
    window.sessionStorage.setItem("notification-button-position", JSON.stringify(next));
  }

  function handlePointerUp(event: PointerEvent<HTMLDivElement>) {
    isDragging.current = false;
    event.currentTarget.releasePointerCapture(event.pointerId);
  }

  if (!user) return null;

  return (
    <div
      className="pointer-events-none fixed z-[45] touch-none"
      style={{ left: position.x, top: position.y }}
    >
      <div
        className="pointer-events-auto relative flex cursor-grab items-center rounded-full border border-border bg-background/95 p-1 shadow-md backdrop-blur-md active:cursor-grabbing"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        title="Drag to move notifications"
      >
        <NotificationBell />
        <span className="sr-only">Drag notification button to move it</span>
        <Grip className="pointer-events-none absolute -bottom-1 -right-1 h-3 w-3 rounded-full bg-background text-muted-foreground" aria-hidden="true" />
      </div>
    </div>
  );
}
