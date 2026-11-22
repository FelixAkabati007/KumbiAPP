import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import React from "react";
import { render, act } from "@testing-library/react";
import { DomSanitizer } from "@/components/dom-sanitizer";

describe("DomSanitizer", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = "";
  });

  it("eradicates foreign Azure 403 Forbidden watermark headings from document.body", async () => {
    // Inject mock Azure 403 elements directly into body (simulating orphan nodes)
    const azureHeader = document.createElement("h2");
    azureHeader.textContent = "Error 403 - Forbidden";
    document.body.appendChild(azureHeader);

    const azureSubheader = document.createElement("h3");
    azureSubheader.textContent = "The web app you have attempted to reach has blocked your access.";
    document.body.appendChild(azureSubheader);

    expect(document.body.contains(azureHeader)).toBe(true);
    expect(document.body.contains(azureSubheader)).toBe(true);

    // Mount DomSanitizer
    render(<DomSanitizer />);

    // Fast-forward timers
    act(() => {
      vi.advanceTimersByTime(100);
    });

    // Verify foreign 403 nodes are permanently removed from the DOM
    expect(document.body.contains(azureHeader)).toBe(false);
    expect(document.body.contains(azureSubheader)).toBe(false);
    expect(document.body.textContent).not.toContain("Error 403 - Forbidden");
    expect(document.body.textContent).not.toContain("blocked your access");
  });

  it("removes dynamically injected foreign watermark nodes via MutationObserver", async () => {
    render(<DomSanitizer />);

    // Later dynamic injection
    const rogueDiv = document.createElement("div");
    rogueDiv.textContent = "The web app you have attempted to reach has blocked your access.";
    document.body.appendChild(rogueDiv);

    act(() => {
      vi.advanceTimersByTime(100);
    });

    expect(document.body.contains(rogueDiv)).toBe(false);
  });
});
