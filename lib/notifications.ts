import { getSettings } from "@/lib/settings";

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}

let cachedOriginalFaviconHref: string | null = null;
let cachedOriginalDocumentTitle: string | null = null;

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

/**
 * Updates browser favicon with dynamic numeric badge overlay and syncs document title
 */
export function updateFaviconBadge(count: number) {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  try {
    // 1. Sync Document Title prefix e.g. "(3) Kumbisaly POS"
    if (cachedOriginalDocumentTitle === null) {
      cachedOriginalDocumentTitle = document.title.replace(/^\(\d+\+?\)\s*/, "");
    }
    const baseTitle = cachedOriginalDocumentTitle || "KumbiAPP";
    if (count > 0) {
      const badgeText = count > 99 ? "99+" : `${count}`;
      document.title = `(${badgeText}) ${baseTitle}`;
    } else {
      document.title = baseTitle;
    }

    // 2. Favicon overlay
    const faviconLink = (document.querySelector("link[rel*='icon']") as HTMLLinkElement) || null;
    if (!faviconLink) return;

    if (cachedOriginalFaviconHref === null) {
      cachedOriginalFaviconHref = faviconLink.href || "/favicon.ico";
    }

    if (count <= 0) {
      faviconLink.href = cachedOriginalFaviconHref;
      return;
    }

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = cachedOriginalFaviconHref;

    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        // Draw original icon
        ctx.drawImage(img, 0, 0, 64, 64);

        // Draw red badge circle in top-right
        const badgeText = count > 99 ? "99+" : `${count}`;
        const radius = badgeText.length > 2 ? 18 : 16;
        const cx = 64 - radius;
        const cy = radius;

        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, 2 * Math.PI);
        ctx.fillStyle = "#ef4444";
        ctx.fill();
        ctx.lineWidth = 3;
        ctx.strokeStyle = "#ffffff";
        ctx.stroke();

        // Draw badge text
        ctx.fillStyle = "#ffffff";
        ctx.font = badgeText.length > 2 ? "bold 18px sans-serif" : "bold 20px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(badgeText, cx, cy + 1);

        faviconLink.href = canvas.toDataURL("image/png");
      } catch {
        // canvas drawing failure or cross-origin taint: ignore
      }
    };
  } catch {
    // ignore
  }
}

/**
 * Synchronizes the app badge across OS PWA icon (navigator.setAppBadge),
 * Service Worker global scope, and browser favicon/title fallback.
 */
export async function syncAppIconBadge(count: number) {
  if (typeof window === "undefined") return;

  const safeCount = Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;

  // 1. Native Badging API on window.navigator (PWA installed on iOS 16.4+, Android Chrome, macOS Safari/Chrome Dock, Windows Taskbar)
  if ("setAppBadge" in navigator) {
    try {
      if (safeCount > 0) {
        await (navigator as Navigator & { setAppBadge: (c: number) => Promise<void> }).setAppBadge(safeCount);
      } else {
        await (navigator as Navigator & { clearAppBadge: () => Promise<void> }).clearAppBadge();
      }
    } catch {
      // Platform or permission not granted
    }
  }

  // 2. Forward to Service Worker controller
  try {
    if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: "SET_APP_BADGE",
        count: safeCount,
      });
    }
  } catch {
    // ignore
  }

  // 3. Tab Favicon & Title Fallback
  updateFaviconBadge(safeCount);
}

export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * Ensures the device has a Web Push subscription registered with the backend.
 */
export async function ensureDevicePushSubscription(): Promise<boolean> {
  if (
    typeof window === "undefined" ||
    !("serviceWorker" in navigator) ||
    !("PushManager" in window) ||
    !("Notification" in window)
  ) {
    return false;
  }

  if (Notification.permission !== "granted") {
    return false;
  }

  try {
    const reg = await navigator.serviceWorker.ready;
    if (!reg.pushManager) return false;

    // 1. Get VAPID public key and current badge count
    const keyRes = await fetch("/api/notifications/push", { cache: "no-store" });
    if (!keyRes.ok) return false;
    const { publicKey, unreadCount } = await keyRes.json();
    if (typeof unreadCount === "number") {
      void syncAppIconBadge(unreadCount);
    }
    if (!publicKey) return false;

    // 2. Check existing subscription or create new
    let subscription = await reg.pushManager.getSubscription();
    if (!subscription) {
      const applicationServerKey = urlBase64ToUint8Array(publicKey);
      subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: applicationServerKey as unknown as BufferSource,
      });
    }

    if (subscription) {
      const subJson = subscription.toJSON();
      if (subJson.endpoint && subJson.keys?.p256dh && subJson.keys?.auth) {
        await fetch("/api/notifications/push", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            endpoint: subJson.endpoint,
            keys: {
              p256dh: subJson.keys.p256dh,
              auth: subJson.keys.auth,
            },
            userAgent: typeof navigator !== "undefined" ? navigator.userAgent : null,
          }),
        });
        return true;
      }
    }
  } catch (err) {
    console.warn("[Push] Failed to register push subscription:", err);
  }
  return false;
}

/**
 * Requests notification permission from user gesture and registers Web Push.
 */
export async function requestDeviceNotificationPermissionAndSubscribe(): Promise<boolean> {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return false;
  }

  try {
    const perm = await Notification.requestPermission();
    if (perm === "granted") {
      return await ensureDevicePushSubscription();
    }
  } catch (err) {
    console.warn("[Push] Permission request failed:", err);
  }
  return false;
}

/**
 * Unsubscribes the current device push endpoint on logout.
 */
export async function unsubscribeDevicePushOnLogout(): Promise<void> {
  if (
    typeof window === "undefined" ||
    !("serviceWorker" in navigator) ||
    !("PushManager" in window)
  ) {
    return;
  }

  try {
    const reg = await navigator.serviceWorker.ready;
    const subscription = await reg.pushManager.getSubscription();
    if (subscription) {
      const endpoint = subscription.endpoint;
      await subscription.unsubscribe().catch(() => {});
      if (endpoint) {
        await fetch("/api/notifications/push", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint }),
        }).catch(() => {});
      }
    }
  } catch {
    // ignore
  } finally {
    void syncAppIconBadge(0);
  }
}
