import { getSettings } from "@/lib/settings";

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}

export function playNotificationSound() {
  if (typeof window === "undefined") return;
  try {
    const settings = getSettings();
    if (!settings.notifications.soundEnabled) return;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.value = 880; // A5 note, pleasant chime
    g.gain.value = 0.15;
    o.connect(g);
    g.connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.18);
    o.onended = () => ctx.close();
  } catch {
    // Fallback: do nothing
  }
}
