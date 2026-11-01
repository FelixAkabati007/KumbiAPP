import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { NextRequest } from "next/server";
import { GET as getPublicBrand } from "../../app/api/public/brand/route";
import { GET as getFavicon } from "../../app/favicon.ico/route";
import { fetchSettings, saveSettings } from "../../lib/settings";

vi.mock("@/lib/db", () => ({
  query: vi.fn(),
  getClient: vi.fn(),
  transaction: vi.fn(),
}));

describe("Logo Unification: Public Brand, Dynamic Favicon & Settings Sync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  describe("Public Brand Endpoint (/api/public/brand)", () => {
    it("returns company logo and branding without requiring authentication", async () => {
      const { query } = await import("@/lib/db");
      (query as unknown as Mock).mockResolvedValueOnce({
        rows: [
          {
            restaurant_name: "Kumbisaly Heritage Luxury Hotel",
            owner_name: "Owner Felix",
            email: "hotel@kumbisaly.com",
            phone: "0535975442",
            address: "Offinso - Abofour, Ashanti, Ghana.",
            logo: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
            updated_at: "2026-10-31T12:00:00.000Z",
          },
        ],
      });

      const res = await getPublicBrand();
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.restaurantName).toBe("Kumbisaly Heritage Luxury Hotel");
      expect(data.logo).toContain("data:image/png;base64");
      expect(res.headers.get("Cache-Control")).toContain("public");
    });

    it("falls back gracefully when database profile is unpopulated", async () => {
      const { query } = await import("@/lib/db");
      (query as unknown as Mock)
        .mockResolvedValueOnce({ rows: [] }) // restaurant_profile
        .mockResolvedValueOnce({ rows: [] }); // settings

      const res = await getPublicBrand();
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.restaurantName).toBe("Kumbisaly Heritage Restaurant");
      expect(data.address).toBe("Offinso - Abofour, Ashanti, Ghana.");
    });
  });

  describe("Dynamic Favicon Route (/favicon.ico)", () => {
    it("generates 64x64 PNG buffer from data URL logo without redirecting", async () => {
      const { query } = await import("@/lib/db");
      const sample1x1Png =
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

      (query as unknown as Mock).mockResolvedValueOnce({
        rows: [{ logo: sample1x1Png }],
      });

      const request = new NextRequest("http://localhost:3000/favicon.ico");
      const res = await getFavicon(request);

      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toBe("image/png");
      expect(res.headers.get("Cache-Control")).toContain("public");
      // Must not redirect to localhost
      expect(res.headers.get("Location")).toBeNull();

      const arrayBuffer = await res.arrayBuffer();
      expect(arrayBuffer.byteLength).toBeGreaterThan(0);
    });

    it("serves default fallback image buffer directly if database query throws", async () => {
      const { query } = await import("@/lib/db");
      (query as unknown as Mock).mockRejectedValueOnce(new Error("Database disconnected"));

      const request = new NextRequest("https://kumresh.com/favicon.ico");
      const res = await getFavicon(request);

      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toBe("image/png");
      expect(res.headers.get("Location")).toBeNull();
    });
  });

  describe("Settings & Cross-Tab Synchronization", () => {
    it("falls back to public brand when unauthenticated and updates localStorage", async () => {
      // Mock global fetch: /api/v1/settings -> 401 Unauthorized, /api/public/brand -> returns custom brand
      const customBrandLogo = "data:image/webp;base64,TEST_BRAND_LOGO";
      const globalFetchMock = vi.fn().mockImplementation((url: string) => {
        if (url.includes("/api/v1/settings")) {
          return Promise.resolve(new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 }));
        }
        if (url.includes("/api/public/brand")) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                restaurantName: "Kumbisaly Heritage Public Brand",
                logo: customBrandLogo,
                address: "Offinso - Abofour",
              }),
              { status: 200 }
            )
          );
        }
        return Promise.reject(new Error("Unknown route"));
      });
      vi.stubGlobal("fetch", globalFetchMock);

      const settings = await fetchSettings();
      expect(settings.account.restaurantName).toBe("Kumbisaly Heritage Public Brand");
      expect(settings.account.logo).toBe(customBrandLogo);
      expect(localStorage.getItem("kumbi_cached_logo")).toBe(customBrandLogo);

      vi.unstubAllGlobals();
    });

    it("saveSettings writes brand update timestamp and logo to localStorage", async () => {
      const globalFetchMock = vi.fn().mockImplementation(() =>
        Promise.resolve(
          new Response(JSON.stringify({ success: true, version: 15 }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
        )
      );
      vi.stubGlobal("fetch", globalFetchMock);

      const eventListenerSpy = vi.fn();
      window.addEventListener("settingsUpdated", eventListenerSpy);

      const initialSettings = await fetchSettings();
      const updated = {
        ...initialSettings,
        account: {
          ...initialSettings.account,
          logo: "data:image/webp;base64,NEW_SAVED_LOGO",
        },
      };

      const result = await saveSettings(updated);
      expect(result.success).toBe(true);
      expect(result.version).toBe(15);
      expect(localStorage.getItem("kumbi_cached_logo")).toBe("data:image/webp;base64,NEW_SAVED_LOGO");
      expect(localStorage.getItem("kumbi_brand_updated_at")).toBeTruthy();
      expect(eventListenerSpy).toHaveBeenCalledTimes(1);

      window.removeEventListener("settingsUpdated", eventListenerSpy);
      vi.unstubAllGlobals();
    });
  });
});
