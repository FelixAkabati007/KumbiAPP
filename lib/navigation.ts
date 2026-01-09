// Utility helpers for route navigation and in-page scroll jumps
// Provides: jumpThenBack (router-like) and scrollJumpThenBack (DOM scroll)

// Use a minimal router interface to avoid depending on Next.js internals
export interface RouterLike {
  push: (href: string) => void;
  replace: (href: string) => void;
  back: () => void;
}

/**
 * Navigate to a route, then return to the previous page (one step back).
 * Uses a small delay to allow the route change to settle before going back.
 */
export async function jumpThenBack(
  router: RouterLike,
  href: string,
  options?: { replace?: boolean; delayMs?: number },
): Promise<void> {
  const { replace = false, delayMs = 300 } = options || {};

  // Trigger the "jump" action
  const action = replace ? router.replace : router.push;
  action(href);

  // Wait briefly, then go back one step
  await new Promise((resolve) => setTimeout(resolve, delayMs));
  router.back();
}

/**
 * Scroll to an element (by id or HTMLElement), then restore the previous scroll position.
 * Useful for in-page "jump" interactions without changing routes.
 */
export function scrollJumpThenBack(
  target: string | HTMLElement,
  options?: { behavior?: ScrollBehavior; offset?: number; delayMs?: number },
): void {
  if (typeof window === "undefined") return; // SSR safety

  const { behavior = "smooth", offset = 0, delayMs = 300 } = options || {};

  const prevX = window.scrollX;
  const prevY = window.scrollY;

  const el =
    typeof target === "string" ? document.getElementById(target) : target;
  if (el) {
    el.scrollIntoView({ behavior, block: "start" });
    if (offset) window.scrollBy({ top: offset, behavior });
  }

  // Restore previous position after a short delay
  window.setTimeout(() => {
    window.scrollTo({ left: prevX, top: prevY, behavior });
  }, delayMs);
}

/**
 * Go back a specific number of steps using the browser history.
 * Safe no-op on server.
 */
export function goBackSteps(steps: number = 1): void {
  if (typeof window === "undefined") return;
  const count = Math.max(1, Math.floor(steps));
  window.history.go(-count);
}

/**
 * Go back a specific number of steps using Next.js App Router.
 * Adds a small delay between steps to allow history to settle.
 */
export async function routerBackSteps(
  router: RouterLike,
  steps: number = 1,
  delayMs: number = 150,
): Promise<void> {
  const count = Math.max(1, Math.floor(steps));
  for (let i = 0; i < count; i++) {
    router.back();
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
}
