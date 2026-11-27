const CACHE_NAME = "kumbi-offline-v6";
const APP_SHELL = [
  "/",
  "/pos",
  "/inventory",
  "/attendance",
  "/manifest.webmanifest",
  "/favicon.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Use individual puts so a single missing page doesn't abort the entire install
      return Promise.all(
        APP_SHELL.map((url) =>
          cache.add(url).catch((err) => {
            console.warn(`[SW] Precache failed for ${url}:`, err);
          })
        )
      );
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Only handle GET requests originating from same origin
  if (event.request.method !== "GET" || !url.origin.startsWith(self.location.origin)) {
    return;
  }

  // Never intercept or cache auth, session, realtime SSE, or notifications endpoints
  if (
    url.pathname.startsWith("/api/auth") ||
    url.pathname.startsWith("/api/notifications") ||
    url.pathname.startsWith("/api/realtime") ||
    url.pathname === "/login"
  ) {
    return;
  }

  // 1. API Route Requests
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // Cache successful reads of menu or inventory
          if (
            response.ok &&
            (url.pathname === "/api/menu" || url.pathname === "/api/inventory")
          ) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(async () => {
          // Check if we have cached JSON response
          const cached = await caches.match(event.request);
          if (cached) return cached;

          // NEVER return HTML for an API request when offline
          return new Response(
            JSON.stringify({
              error: "Network unavailable. Operating in offline mode.",
              offline: true,
            }),
            {
              status: 503,
              statusText: "Service Unavailable (Offline)",
              headers: { "Content-Type": "application/json" },
            }
          );
        })
    );
    return;
  }

  // 2. Static Next.js Chunks & Assets (_next/static/*)
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return response;
        });
      })
    );
    return;
  }

  // 3. Navigation / HTML Pages
  event.respondWith(
    fetch(event.request)
      .then(async (response) => {
        // Intercept 403 Forbidden pages from gateways or proxies and fall back to app shell
        if (!response.ok && response.status === 403) {
          const cached = await caches.match(event.request);
          if (cached) return cached;
          const shell = await caches.match("/");
          if (shell) return shell;
        }
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(event.request);
        if (cached) return cached;
        // Fallback to app shell
        const shell = await caches.match("/");
        if (shell) return shell;
        return new Response("KumbiAPP is currently offline.", {
          status: 503,
          headers: { "Content-Type": "text/plain" },
        });
      })
  );
});

// Push notification handling with OS App Icon Badging
self.addEventListener("push", (event) => {
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch {
      data = { title: "KumbiAPP Alert", body: event.data.text() };
    }
  }

  const title = data.title || "KumbiAPP Alert";
  const unreadCount = typeof data.unreadCount === "number" ? data.unreadCount : null;

  const promiseChain = [];

  // 1. Update OS App Icon Badge if supported
  if (unreadCount !== null && typeof self.navigator !== "undefined" && "setAppBadge" in self.navigator) {
    if (unreadCount > 0) {
      promiseChain.push(self.navigator.setAppBadge(unreadCount).catch(() => {}));
    } else {
      promiseChain.push(self.navigator.clearAppBadge().catch(() => {}));
    }
  }

  // 2. Display OS Notification unless silent
  if (!data.silent && (data.title || data.body)) {
    const options = {
      body: data.body || "",
      icon: "/favicon.ico?size=192",
      badge: "/favicon.ico?size=192",
      tag: data.tag || `kumbi-${Date.now()}`,
      renotify: true,
      data: {
        url: data.url || "/",
        unreadCount,
        category: data.category,
      },
      vibrate: [100, 50, 100],
    };
    promiseChain.push(self.registration.showNotification(title, options).catch(() => {}));
  }

  // 3. Post message to all open window clients so in-app state/bell updates immediately
  promiseChain.push(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        client.postMessage({
          type: "KUMBI_PUSH_EVENT",
          payload: data,
        });
      }
    })
  );

  event.waitUntil(Promise.all(promiseChain));
});

// Focus or open window on notification click
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const targetUrl = (event.notification.data && event.notification.data.url) || "/";
  const urlToOpen = new URL(targetUrl, self.location.origin).href;

  const promiseChain = self.clients
    .matchAll({ type: "window", includeUncontrolled: true })
    .then((clientList) => {
      for (const client of clientList) {
        if (client.url === urlToOpen && "focus" in client) {
          return client.focus();
        }
      }
      for (const client of clientList) {
        if ("focus" in client && "navigate" in client) {
          client.navigate(urlToOpen);
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(urlToOpen);
      }
    });

  event.waitUntil(promiseChain);
});

// Listen for messages from window clients (e.g. badge sync from foreground)
self.addEventListener("message", (event) => {
  if (!event.data) return;
  if (event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
  if (event.data.type === "SET_APP_BADGE") {
    const count = typeof event.data.count === "number" ? event.data.count : 0;
    if (typeof self.navigator !== "undefined" && "setAppBadge" in self.navigator) {
      if (count > 0) {
        self.navigator.setAppBadge(count).catch(() => {});
      } else {
        self.navigator.clearAppBadge().catch(() => {});
      }
    }
  }
});

