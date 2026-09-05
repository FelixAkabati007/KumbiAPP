"use client";

import { Download, Share, X } from "lucide-react";
import Image from "next/image";
import { useEffect, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches ||
    ("standalone" in window.navigator && Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone));
}

export function InstallAppPrompt() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [iosInstructions, setIosInstructions] = useState(false);

  useEffect(() => {
    if (isStandalone() || sessionStorage.getItem("kumresh-install-dismissed") === "true") return;

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as BeforeInstallPromptEvent);
      setShowPrompt(true);
    };

    const isIos = /iphone|ipad|ipod/i.test(window.navigator.userAgent);
    const isSafari = /safari/i.test(window.navigator.userAgent) && !/crios|fxios|edgios/i.test(window.navigator.userAgent);
    if (isIos && isSafari) setShowPrompt(true);

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
  }, []);

  function dismiss() {
    sessionStorage.setItem("kumresh-install-dismissed", "true");
    setShowPrompt(false);
  }

  async function install() {
    if (!installEvent) {
      setIosInstructions(true);
      return;
    }
    await installEvent.prompt();
    const choice = await installEvent.userChoice;
    if (choice.outcome === "accepted") setShowPrompt(false);
    setInstallEvent(null);
  }

  if (!showPrompt) return null;

  return (
    <aside className="fixed inset-x-3 bottom-3 z-[80] mx-auto max-w-md rounded-3xl border border-orange-200 bg-background p-4 shadow-2xl shadow-orange-950/15 sm:inset-x-auto sm:right-5 sm:bottom-5 dark:border-orange-800">
      <div className="flex items-start gap-3">
        <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-2xl border border-border bg-muted">
          <Image src="/app-icon.png" alt="Kumresh app logo" fill sizes="48px" className="object-contain p-1" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">Install Kumresh</p>
          <p className="mt-1 text-sm leading-5 text-muted-foreground">Keep the staff workspace one tap away on this device.</p>
        </div>
        <button type="button" onClick={dismiss} aria-label="Dismiss install prompt" className="rounded-full p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground"><X className="h-4 w-4" /></button>
      </div>
      {iosInstructions ? (
        <p className="mt-3 rounded-2xl bg-muted p-3 text-sm leading-5 text-foreground">Tap <Share className="mx-1 inline h-4 w-4" aria-hidden="true" /> Share, then choose <strong>Add to Home Screen</strong>.</p>
      ) : (
        <button type="button" onClick={install} className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl bg-orange-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-orange-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2"><Download className="h-4 w-4" aria-hidden="true" /> Install app</button>
      )}
    </aside>
  );
}
