import { describe, test, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST as loginPost } from "../../app/api/auth/login/route";

// Mock dependencies
vi.mock("../../lib/db", () => ({
  query: vi.fn(),
}));

vi.mock("../../lib/auth", () => ({
  comparePassword: vi.fn(),
  hashPassword: vi.fn(async () => "hashed-default"),
  signToken: vi.fn(() => "mock-token"),
}));

vi.mock("../../lib/rate-limit", () => ({
  recordSignupAttempt: vi.fn(),
  recordAndCheckLoginAttempt: vi.fn(() => false),
  isRateLimited: vi.fn(() => false),
}));

const mockCookieStore = {
  set: vi.fn(),
  getAll: vi.fn(),
  get: vi.fn(),
};

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => mockCookieStore),
}));

function makeReq(body: unknown, headers: Record<string, string> = {}) {
  const url = "http://localhost/api/auth/login";
  const req = new NextRequest(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  req.json = async () => body;
  return req as unknown as Request;
}

describe("Auth Login Route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("rejects missing credentials", async () => {
    const res = await loginPost(makeReq({}));
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.code).toBe("validation_error");
  });

  test("rejects invalid email format", async () => {
    const res = await loginPost(makeReq({ email: "bad", password: "x" }));
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.code).toBe("validation_error");
  });

  test("rejects non-existent user", async () => {
    const { query } = await import("../../lib/db");
    // @ts-expect-error: mocking
    query.mockResolvedValueOnce({ rows: [] });

    const res = await loginPost(
      makeReq({ email: "ghost@test.com", password: "Password123" })
    );
    const json = await res.json();
    expect(res.status).toBe(401);
    expect(json.code).toBe("invalid_credentials");
  });

  test("rejects wrong password", async () => {
    const { query } = await import("../../lib/db");
    const { comparePassword } = await import("../../lib/auth");

    // @ts-expect-error: mocking
    query.mockResolvedValueOnce({
      rows: [
        {
          id: "user1",
          email: "test@test.com",
          password_hash: "hashed",
          email_verified: true,
        },
      ],
    });
    // @ts-expect-error: mocking
    comparePassword.mockResolvedValueOnce(false);

    const res = await loginPost(
      makeReq({ email: "test@test.com", password: "WrongPassword" })
    );
    const json = await res.json();
    expect(res.status).toBe(401);
    expect(json.code).toBe("invalid_credentials");
  });

  test("rejects unverified email", async () => {
    const { query } = await import("../../lib/db");
    const { comparePassword } = await import("../../lib/auth");

    // @ts-expect-error: mocking
    query.mockResolvedValueOnce({
      rows: [
        {
          id: "user1",
          email: "test@test.com",
          password_hash: "hashed",
          email_verified: false,
        },
      ],
    });
    // @ts-expect-error: mocking
    comparePassword.mockResolvedValueOnce(true);

    const res = await loginPost(
      makeReq({ email: "test@test.com", password: "Password123" })
    );
    const json = await res.json();
    expect(res.status).toBe(403);
    expect(json.code).toBe("email_unverified");
  });

  test("logs in successfully with valid credentials", async () => {
    const { query } = await import("../../lib/db");
    const { comparePassword } = await import("../../lib/auth");

    // @ts-expect-error: mocking
    query.mockResolvedValueOnce({
      rows: [
        {
          id: "user1",
          email: "test@test.com",
          name: "Test User",
          role: "staff",
          password_hash: "hashed",
          email_verified: true,
        },
      ],
    });
    // @ts-expect-error: mocking
    comparePassword.mockResolvedValueOnce(true);

    const res = await loginPost(
      makeReq({ email: "test@test.com", password: "Password123" })
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.user.email).toBe("test@test.com");

    // Check cookie was set
    expect(mockCookieStore.set).toHaveBeenCalled();
  });

  test("auto-provisions and logs in Admin and department role accounts when not yet in DB", async () => {
    const { query } = await import("../../lib/db");
    // @ts-expect-error: mocking
    query.mockResolvedValue({ rows: [] });

    const adminRes = await loginPost(
      makeReq({ email: "admin@kumbisaly.com", password: "Admin@123456!" })
    );
    const adminJson = await adminRes.json();
    expect(adminRes.status).toBe(200);
    expect(adminJson.success).toBe(true);
    expect(adminJson.user.role).toBe("admin");

    const chefRes = await loginPost(
      makeReq({ email: "chef@kumbisaly.com", password: "Kitchen@123456!" })
    );
    const chefJson = await chefRes.json();
    expect(chefRes.status).toBe(200);
    expect(chefJson.success).toBe(true);
    expect(chefJson.user.role).toBe("kitchen");
  });

  test("handles Neon quota exceeded gracefully: 503 for custom accounts, 401 for wrong default password, 200 for valid default account", async () => {
    const { query } = await import("../../lib/db");
    const quotaError = new Error(
      "Your account or project has exceeded the quota. Upgrade your plan to increase limits."
    );
    // @ts-expect-error: mocking
    query.mockRejectedValue(quotaError);

    // 1. Custom DB-backed staff account -> 503 database_quota_exceeded (instead of opaque 500)
    const customRes = await loginPost(
      makeReq({ email: "custom.staff@kumbisaly.com", password: "Password123!" })
    );
    const customJson = await customRes.json();
    expect(customRes.status).toBe(503);
    expect(customJson.code).toBe("database_quota_exceeded");

    // 2. Default role email with wrong password -> 401 invalid_credentials (instead of 500)
    const wrongAdminRes = await loginPost(
      makeReq({ email: "admin@kumbisaly.com", password: "WrongPassword123!" })
    );
    const wrongAdminJson = await wrongAdminRes.json();
    expect(wrongAdminRes.status).toBe(401);
    expect(wrongAdminJson.code).toBe("invalid_credentials");

    // 3. Default role email with valid password -> 200 OK emergency access
    const okAdminRes = await loginPost(
      makeReq({ email: "admin@kumbisaly.com", password: "Admin@123456!" })
    );
    const okAdminJson = await okAdminRes.json();
    expect(okAdminRes.status).toBe(200);
    expect(okAdminJson.success).toBe(true);
  });
});
