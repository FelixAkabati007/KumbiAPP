"use client";

import { useEffect } from "react";

/**
 * Global DOM Sanitizer & Error Guard
 *
 * Scans document.body and the DOM tree to eradicate any lingering or cached
 * error messages (e.g., Azure App Service "Error 403 - Forbidden / The web app
 * you have attempted to reach has blocked your access") that may exist as
 * orphaned DOM nodes from previous blocked loads or PWA initializations.
 */
function sanitizeDom() {
  if (typeof document === "undefined" || !document.body) return;

  try {
    // 1. Target all text nodes directly under body or html
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      null
    );

    const nodesToRemove: Node[] = [];
    let currentNode = walker.nextNode();
    while (currentNode) {
      const text = currentNode.textContent || "";
      if (
        text.includes("blocked your access") ||
        text.includes("Error 403 - Forbidden") ||
        text.includes("The web app you have attempted to reach")
      ) {
        // If parent is not a legitimate in-app error component, mark for removal
        const parent = currentNode.parentElement;
        if (parent && !parent.closest("[data-kumbi-app]")) {
          nodesToRemove.push(parent);
        } else if (parent) {
          nodesToRemove.push(currentNode);
        }
      }
      currentNode = walker.nextNode();
    }

    nodesToRemove.forEach((node) => {
      try {
        if ("remove" in node && typeof (node as HTMLElement).remove === "function") {
          (node as HTMLElement).remove();
        } else if (node.parentNode) {
          node.parentNode.removeChild(node);
        }
      } catch {
        // Safe cleanup fallback
      }
    });

    // 2. Query any headings or paragraphs matching the Azure 403 signature outside app root
    const headings = document.querySelectorAll("h1, h2, h3, p, div, span");
    headings.forEach((el) => {
      const content = el.textContent || "";
      if (
        content.includes("The web app you have attempted to reach has blocked your access") ||
        (content.includes("Error 403 - Forbidden") && !el.closest("[data-kumbi-app]"))
      ) {
        // Don't remove if it's inside our own explicit UI dialog
        if (!el.closest("[role='dialog']") && !el.closest("[role='alert']")) {
          el.remove();
        }
      }
    });
  } catch (err) {
    console.warn("[DOM Sanitizer] Cleanup encountered error:", err);
  }
}

export function DomSanitizer() {
  useEffect(() => {
    // Run immediately on mount
    sanitizeDom();

    // Re-run after next tick to catch any post-hydration leftover nodes
    const timer1 = setTimeout(sanitizeDom, 50);
    const timer2 = setTimeout(sanitizeDom, 500);
    const timer3 = setTimeout(sanitizeDom, 2000);

    // Watch for dynamic DOM insertions
    let observer: MutationObserver | null = null;
    if (typeof MutationObserver !== "undefined") {
      observer = new MutationObserver(() => {
        sanitizeDom();
      });
      observer.observe(document.body, {
        childList: true,
        subtree: true,
      });
    }

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
      if (observer) {
        observer.disconnect();
      }
    };
  }, []);

  return null;
}
