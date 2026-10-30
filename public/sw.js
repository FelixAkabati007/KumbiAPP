const CACHE_NAME = "kumbi-offline-v2";
const APP_SHELL = [
  "/",
  "/login",
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
      .then((response) => {
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
