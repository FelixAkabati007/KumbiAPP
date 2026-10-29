import * as React from "react";
import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { SWRConfig } from "swr";
import { AppUpdateMenu } from "@/components/app-update-menu";
import type { SoftwareUpdateResponse } from "@/lib/software-updates";

const mockToast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({
    toast: mockToast,
  }),
}));

const mockSystemSyncState = { updates: "", global: "" };
vi.mock("@/hooks/use-system-sync", () => ({
  useSystemSync: () => ({
    versions: mockSystemSyncState,
  }),
}));

const mockReleasePayload: SoftwareUpdateResponse = {
  currentVersion: "1.2.5",
  currentBuild: "prod-2026-10-28-55e6ba1",
  latestVersion: "1.2.5",
  latestBuild: "prod-2026-10-28-55e6ba1",
  isUpdateAvailable: false,
  branch: "main",
  deploymentId: null,
  source: "system release registry",
  checkedAt: "2026-10-29T10:00:00.000Z",
  updates: [
    {
      id: "update-1.2.5",
      version: "1.2.5",
      build: "prod-2026-10-28-55e6ba1",
      title: "Unified Blob Storage & Neon Connection Architecture",
      description: "Enterprise storage and resilient authentication.",
      releaseDate: "2026-10-28T21:05:00.000Z",
      type: "major",
      isCritical: true,
      details: [
        "Unified hybrid blob storage: Seamless auto-switching between Vercel Blob and Neon PostgreSQL",
        "Resilient database connection resolution across all Neon & Vercel Postgres environment variables",
      ],
      source: "Core Team",
    },
    {
      id: "update-1.2.0",
      version: "1.2.0",
      build: "prod-2026-10-27-89df312",
      title: "Canonical Financial Ledger & Inventory Conversions",
      description: "Financial immutability and multi-unit recipe conversions.",
      releaseDate: "2026-10-27T18:30:00.000Z",
      type: "feature",
      isCritical: false,
      details: [
        "Double-entry canonical financial ledger with immutable reconciliation",
        "Dynamic inventory unit of measure conversions",
      ],
      source: "Finance Team",
    },
  ],
  latestUpdate: {
    id: "update-1.2.5",
    version: "1.2.5",
    build: "prod-2026-10-28-55e6ba1",
    title: "Unified Blob Storage & Neon Connection Architecture",
    description: "Enterprise storage and resilient authentication.",
    releaseDate: "2026-10-28T21:05:00.000Z",
    type: "major",
    isCritical: true,
    details: [
      "Unified hybrid blob storage: Seamless auto-switching between Vercel Blob and Neon PostgreSQL",
    ],
  },
  version: "1.2.5",
  build: "prod-2026-10-28-55e6ba1",
  changes: [
    "Unified hybrid blob storage: Seamless auto-switching between Vercel Blob and Neon PostgreSQL",
  ],
};

function renderWithSWR(ui: React.ReactElement) {
  return render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      {ui}
    </SWRConfig>
  );
}

describe("AppUpdateMenu Navbar Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSystemSyncState.updates = "";
    mockSystemSyncState.global = "";
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockReleasePayload,
    } as unknown as Response);
  });

  afterEach(() => {
    cleanup();
  });

  test("renders Software updates button with proper accessibility attributes", async () => {
    renderWithSWR(<AppUpdateMenu />);

    const button = await screen.findByRole("button", { name: /software updates/i });
    expect(button).toBeDefined();
    expect(button.getAttribute("title")).toBe("Software updates");
    expect(button.className).toContain("rounded-full");
    expect(button.className).toContain("border-orange-200");
  });

  test("loads existing updates and renders complete associated details upon opening", async () => {
    renderWithSWR(<AppUpdateMenu defaultOpen={true} />);

    // Header and version badges
    await waitFor(() => {
      expect(screen.getByText("Software Updates")).toBeDefined();
    });
    expect(screen.getAllByText("v1.2.5").length).toBeGreaterThanOrEqual(1);

    // Verify all update titles render
    expect(
      screen.getByText("Unified Blob Storage & Neon Connection Architecture")
    ).toBeDefined();
    expect(
      screen.getByText("Canonical Financial Ledger & Inventory Conversions")
    ).toBeDefined();

    // Verify details / changes bullet points render
    expect(
      screen.getByText(
        /Unified hybrid blob storage: Seamless auto-switching between Vercel Blob and Neon PostgreSQL/i
      )
    ).toBeDefined();
    expect(
      screen.getByText(/Double-entry canonical financial ledger with immutable reconciliation/i)
    ).toBeDefined();

    // Verify metadata renders (type badges, branch)
    expect(screen.getByText("major")).toBeDefined();
    expect(screen.getByText("Security")).toBeDefined();
    expect(screen.getByText("feature")).toBeDefined();
    expect(screen.getByText(/Branch: main/i)).toBeDefined();
  });

  test("does not fire disruptive toast on initial mount", async () => {
    renderWithSWR(<AppUpdateMenu />);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /software updates/i })).toBeDefined();
    });
    expect(mockToast).not.toHaveBeenCalled();
  });

  test("correctly reflects newly released updates in real-time when update is available", async () => {
    const updatedPayload: SoftwareUpdateResponse = {
      ...mockReleasePayload,
      latestVersion: "1.3.0",
      latestBuild: "prod-2026-10-29-new-build",
      isUpdateAvailable: true,
      latestUpdate: {
        id: "update-1.3.0",
        version: "1.3.0",
        build: "prod-2026-10-29-new-build",
        title: "Real-Time Inventory Streaming",
        description: "WebSocket stock level synchronization",
        releaseDate: "2026-10-29T12:00:00.000Z",
        type: "feature",
        isCritical: false,
        details: ["Instant stock level delta notifications"],
      },
      updates: [
        {
          id: "update-1.3.0",
          version: "1.3.0",
          build: "prod-2026-10-29-new-build",
          title: "Real-Time Inventory Streaming",
          description: "WebSocket stock level synchronization",
          releaseDate: "2026-10-29T12:00:00.000Z",
          type: "feature",
          isCritical: false,
          details: ["Instant stock level delta notifications"],
        },
        ...mockReleasePayload.updates,
      ],
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => updatedPayload,
    } as unknown as Response);

    renderWithSWR(<AppUpdateMenu defaultOpen={true} />);

    // Trigger button should indicate update available with exclamation/alert badge
    await waitFor(() => {
      const updatedTrigger = screen.getByRole("button", {
        name: /software updates.*update available/i,
        hidden: true,
      });
      expect(updatedTrigger).toBeDefined();
    });

    // Opening dropdown displays the actionable "Reload App" banner and latest update details
    await waitFor(() => {
      expect(screen.getByText(/Update Ready: v1.3.0/i)).toBeDefined();
      expect(screen.getByRole("button", { name: /Reload App/i })).toBeDefined();
      expect(screen.getAllByText("Real-Time Inventory Streaming").length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText("Instant stock level delta notifications")).toBeDefined();
    });
  });

  test("handles API errors gracefully with inline retry without crashing", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("Network disconnect"));

    renderWithSWR(<AppUpdateMenu defaultOpen={true} />);

    // Displays inline error banner with Retry button
    await waitFor(() => {
      expect(screen.getByText(/Unable to sync updates from server/i)).toBeDefined();
    });
    const retryBtn = screen.getByRole("button", { name: /Retry/i });
    expect(retryBtn).toBeDefined();
  });

  test("supports manual update checking via refresh button with toast feedback", async () => {
    renderWithSWR(<AppUpdateMenu defaultOpen={true} />);

    const checkNowBtn = await screen.findByRole("button", { name: /check for updates now/i });
    fireEvent.click(checkNowBtn);

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "KumbiAPP is up to date",
        })
      );
    });
  });
});
