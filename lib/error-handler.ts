// Global error handler for chunk loading issues and Vite client errors
let installed = false;

export function setupGlobalErrorHandler() {
  if (typeof window === "undefined" || installed) {
    return;
  }
  installed = true;
  if (typeof window !== "undefined") {
    // Handle chunk loading errors
    window.addEventListener("error", (event) => {
      const msg =
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (event as any)?.message || (event.error && event.error.message) || "";
      if (typeof msg === "string" && msg.includes("ERR_ABORTED")) {
        event.preventDefault?.();
        console.warn("Suppressed aborted network request");
        return;
      }
      if (event.error && event.error.name === "ChunkLoadError") {
        console.error("Chunk loading error detected:", event.error);

        // Show user-friendly error message using app-level CSS tokens
        const errorMessage = document.createElement("div");
        errorMessage.className = "khh-alert";
        errorMessage.innerHTML = `
          <strong>Loading Error</strong><br>
          Please refresh the page to try again.
          <button onclick="window.location.reload()" class="khh-alert-btn">Refresh</button>
        `;
        document.body.appendChild(errorMessage);

        // Remove the message after 10 seconds
        setTimeout(() => {
          if (errorMessage.parentNode) {
            errorMessage.parentNode.removeChild(errorMessage);
          }
        }, 10000);
      }
    });

    // Handle unhandled promise rejections
    window.addEventListener("unhandledrejection", (event) => {
      // Handle Vite client promise rejections silently
      if (
        event.reason &&
        (event.reason.message?.includes("ERR_ABORTED") ||
          event.reason.message?.includes("@vite/client") ||
          event.reason.message?.includes("vite") ||
          event.reason.code === "MODULE_NOT_FOUND")
      ) {
        console.warn(
          "Vite-related promise rejection suppressed:",
          event.reason
        );
        event.preventDefault();
        return;
      }

      if (event.reason && event.reason.name === "ChunkLoadError") {
        console.error("Unhandled chunk loading error:", event.reason);
        event.preventDefault();

        // Show user-friendly error message using app-level CSS tokens
        const errorMessage = document.createElement("div");
        errorMessage.className = "khh-alert";
        errorMessage.innerHTML = `
          <strong>Loading Error</strong><br>
          Please refresh the page to try again.
          <button onclick="window.location.reload()" class="khh-alert-btn">Refresh</button>
        `;
        document.body.appendChild(errorMessage);

        // Remove the message after 10 seconds
        setTimeout(() => {
          if (errorMessage.parentNode) {
            errorMessage.parentNode.removeChild(errorMessage);
          }
        }, 10000);
      }
    });

    // Suppress fetch errors for Vite client
    const originalFetch = window.fetch;
    window.fetch = function (...args) {
      const url = args[0];
      if (typeof url === "string" && url.includes("@vite/client")) {
        console.warn("Vite client fetch suppressed:", url);
        return Promise.reject(
          new Error("Vite client not available in Next.js")
        );
      }
      return originalFetch.apply(this, args);
    };
  }
}
