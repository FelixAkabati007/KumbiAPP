import { describe, test, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import {
  compareSemver,
  CANONICAL_SOFTWARE_UPDATES,
  getSoftwareUpdates,
  getReleasePayload,
  publishSoftwareUpdate,
} from "@/lib/software-updates";
import { GET as getVersion, POST as postVersion } from "@/app/api/system/version/route";

vi.mock("@/lib/db", () => ({
  query: vi.fn(),
}));

vi.mock("@/lib/system-sync", () => ({
  updateSystemState: vi.fn(async () => {}),
}));

vi.mock("@/lib/api-auth", () => ({
  requireRole: vi.fn(async () => ({ user: { role: "admin" } })),
}));

describe("Software Updates Backend & API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("compareSemver utility", () => {
    test("correctly identifies newer and older versions", () => {
      expect(compareSemver("1.2.6", "1.2.5")).toBe(1);
      expect(compareSemver("1.2.5", "1.2.6")).toBe(-1);
      expect(compareSemver("1.2.5", "1.2.5")).toBe(0);
      expect(compareSemver("v1.3.0", "1.2.5")).toBe(1);
      expect(compareSemver("2.0.0", "1.9.9")).toBe(1);
      expect(compareSemver("1.2.0", "1.10.0")).toBe(-1);
    });
  });

  describe("Canonical Software Updates", () => {
    test("has valid structured metadata for all canonical releases", () => {
      expect(CANONICAL_SOFTWARE_UPDATES.length).toBeGreaterThanOrEqual(4);
      for (const update of CANONICAL_SOFTWARE_UPDATES) {
        expect(update.id).toBeTruthy();
        expect(update.version).toMatch(/^\d+\.\d+\.\d+$/);
        expect(update.title).toBeTruthy();
        expect(Array.isArray(update.details)).toBe(true);
        expect(update.details.length).toBeGreaterThan(0);
        expect(new Date(update.releaseDate).getTime()).not.toBeNaN();
        expect(["major", "feature", "fix", "security", "maintenance"]).toContain(update.type);
      }
    });
  });

  describe("getSoftwareUpdates", () => {
    test("falls back cleanly to canonical updates when database fails or is empty", async () => {
      const { query } = await import("@/lib/db");
      // @ts-expect-error mocking
      query.mockRejectedValueOnce(new Error("DB offline"));

      const updates = await getSoftwareUpdates();
      expect(updates.length).toBe(CANONICAL_SOFTWARE_UPDATES.length);
      expect(updates[0].version).toBe("1.2.5");
      expect(updates[0].title).toBe("Unified Blob Storage & Neon Connection Architecture");
    });

    test("retrieves updates from database and merges canonical items", async () => {
      const { query } = await import("@/lib/db");
      // @ts-expect-error mocking
      query
        .mockResolvedValueOnce({ rows: [] }) // ensure table
        .mockResolvedValueOnce({ rows: [{ count: "1" }] }) // table count check
        .mockResolvedValueOnce({
          rows: [
            {
              id: "update-1.3.0",
              version: "1.3.0",
              build: "build-1.3.0",
              title: "Next-Gen Analytics Engine",
              description: "Real-time revenue reporting",
              type: "feature",
              is_critical: false,
              details: ["Added custom chart widgets", "Automated daily CSV exports"],
              source: "Production",
              release_date: "2026-10-30T10:00:00.000Z",
            },
          ],
        });

      const updates = await getSoftwareUpdates();
      expect(updates.length).toBeGreaterThan(CANONICAL_SOFTWARE_UPDATES.length);
      expect(updates[0].version).toBe("1.3.0");
      expect(updates[0].details).toContain("Added custom chart widgets");
    });
  });

  describe("getReleasePayload", () => {
    test("constructs full release payload with update availability flag", async () => {
      const payload = await getReleasePayload();
      expect(payload.currentVersion).toBeTruthy();
      expect(payload.latestVersion).toBeTruthy();
      expect(Array.isArray(payload.updates)).toBe(true);
      expect(payload.updates.length).toBeGreaterThan(0);
      expect(payload.latestUpdate).toBeDefined();
      expect(payload.changes.length).toBeGreaterThan(0);
      expect(typeof payload.isUpdateAvailable).toBe("boolean");
    });

    test("detects update available when client build differs from production build", async () => {
      const payload = await getReleasePayload("old-outdated-client-build");
      expect(payload.isUpdateAvailable).toBe(true);
    });
  });

  describe("publishSoftwareUpdate", () => {
    test("persists update and notifies system sync listeners", async () => {
      const { query } = await import("@/lib/db");
      const { updateSystemState } = await import("@/lib/system-sync");

      // @ts-expect-error mocking
      query.mockResolvedValue({ rows: [] });

      const created = await publishSoftwareUpdate({
        version: "1.3.5",
        build: "build-test-123",
        title: "Test Security Patch",
        description: "Zero-day patch",
        type: "security",
        isCritical: true,
        details: ["Fixed session token invalidation boundary"],
      });

      expect(created.version).toBe("1.3.5");
      expect(created.isCritical).toBe(true);
      expect(created.details).toEqual(["Fixed session token invalidation boundary"]);
      expect(updateSystemState).toHaveBeenCalledWith("updates");
    });
  });

  describe("API Route Handlers (GET & POST /api/system/version)", () => {
    test("GET returns 200 with complete update details and no-cache headers", async () => {
      const req = new NextRequest("http://localhost/api/system/version");
      const res = await getVersion(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(res.headers.get("Cache-Control")).toContain("no-store");
      expect(json.currentVersion).toBeTruthy();
      expect(json.updates.length).toBeGreaterThan(0);
      expect(json.updates[0].title).toBeTruthy();
      expect(json.updates[0].details.length).toBeGreaterThan(0);
    });

    test("POST publishes a new update when authorized", async () => {
      const req = new NextRequest("http://localhost/api/system/version", {
        method: "POST",
        body: JSON.stringify({
          version: "1.4.0",
          title: "AI Kitchen Assistant",
          description: "Smart prep time prediction",
          type: "feature",
          isCritical: false,
          details: ["Prep time modeling", "Recipe scaling automation"],
        }),
      });

      const res = await postVersion(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.update.version).toBe("1.4.0");
      expect(json.update.details).toContain("Recipe scaling automation");
    });

    test("POST rejects invalid requests missing version or title", async () => {
      const req = new NextRequest("http://localhost/api/system/version", {
        method: "POST",
        body: JSON.stringify({ description: "Missing version and title" }),
      });

      const res = await postVersion(req);
      expect(res.status).toBe(400);
    });
  });
});
