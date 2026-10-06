import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { GET, POST } from "../../app/api/settings/route";

vi.mock("@/lib/db", () => ({
  query: vi.fn(),
  getClient: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  getSession: vi.fn(),
}));

describe("Settings API", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { getSession } = await import("@/lib/auth");
    (getSession as unknown as Mock).mockResolvedValue({ id: "user-1", role: "admin" });
  });

  describe("GET", () => {
    it("fetches settings and merges with restaurant profile", async () => {
      const { query } = await import("@/lib/db");
      (query as unknown as Mock)
        .mockResolvedValueOnce({ rows: [{ data: { theme: "dark" }, version: 1 }] }) // settings
        .mockResolvedValueOnce({
          rows: [
            {
              restaurant_name: "Test Restaurant",
              owner_name: "Test Owner",
              email: "test@test.com",
              phone: "123",
              address: "Address",
              logo: "logo.png",
            },
          ],
        }); // profile

      const res = await GET();
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.theme).toBe("dark");
      expect(body.account.restaurantName).toBe("Test Restaurant");
      expect(body.account.ownerName).toBe("Test Owner");
    });

    it("returns default settings if no data found", async () => {
      const { query } = await import("@/lib/db");
      (query as unknown as Mock)
        .mockResolvedValueOnce({ rows: [] }) // settings
        .mockResolvedValueOnce({ rows: [] }); // profile

      const res = await GET();
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.account.restaurantName).toBe("Kumbisaly Heritage Restaurant");
    });
  });

  describe("POST", () => {
    it("updates restaurant profile and settings", async () => {
      const { getSession } = await import("@/lib/auth");
      (getSession as unknown as Mock).mockResolvedValue({ role: "admin" });

      const { query, getClient } = await import("@/lib/db");
      (query as unknown as Mock).mockResolvedValue({ rows: [] });
      const client = {
        query: vi.fn().mockImplementation((sql: string) =>
          sql.includes("SELECT data, version")
            ? Promise.resolve({ rows: [{ data: {}, version: 1 }] })
            : Promise.resolve({ rowCount: 1, rows: [{ version: 2 }] }),
        ),
        release: vi.fn(),
      };
      (getClient as unknown as Mock).mockResolvedValue(client);

      const req = new Request("http://localhost/api/settings", {
        method: "POST",
        body: JSON.stringify({
          theme: "light",
          account: {
            restaurantName: "New Name",
            ownerName: "New Owner",
            email: "test@example.com",
            phone: "123",
            address: "Addr",
            logo: "img.png",
          },
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(200);

      // Verify the transaction writes both profile and canonical settings state.
      const calls = (getClient as unknown as Mock).mock.results[0]?.value
        ? await (getClient as unknown as Mock).mock.results[0].value
        : null;
      expect(calls).toBeTruthy();

      const profileCall = (client.query as unknown as Mock).mock.calls.find((c: unknown[]) =>
        String(c[0]).includes("INSERT INTO restaurant_profile")
      );
      expect(profileCall).toBeTruthy();
      expect(profileCall?.[1]).toEqual([
        "New Name",
        "New Owner",
        "test@example.com",
        "123",
        "Addr",
        "img.png",
      ]);

      const settingsCall = (client.query as unknown as Mock).mock.calls.find((c: unknown[]) =>
        String(c[0]).includes("INSERT INTO settings")
      );
      expect(settingsCall).toBeTruthy();

      const jsonbData = JSON.parse(String(settingsCall?.[1]?.[0]));
      expect(jsonbData.theme).toBe("light");
      expect(jsonbData.account).toBeUndefined();
    });

    it("rejects non-admin", async () => {
      const { getSession } = await import("@/lib/auth");
      (getSession as unknown as Mock).mockResolvedValue({ role: "staff" });

      const req = new Request("http://localhost/api/settings", {
        method: "POST",
        body: JSON.stringify({}),
      });

      const res = await POST(req);
      expect(res.status).toBe(403);
    });

    it("validates input with Zod", async () => {
      const { getSession } = await import("@/lib/auth");
      (getSession as unknown as Mock).mockResolvedValue({ role: "admin" });

      const req = new Request("http://localhost/api/settings", {
        method: "POST",
        body: JSON.stringify({
          account: {
            email: "invalid-email",
          },
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("Invalid settings data");
    });
  });
});
