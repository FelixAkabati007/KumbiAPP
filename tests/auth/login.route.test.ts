import { describe, test, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST as loginPost } from "../../app/api/auth/login/route";

// Mock dependencies
vi.mock("../../lib/db", () => ({
  query: vi.fn(),
}));

vi.mock("../../lib/auth", () => ({
  comparePassword: vi.fn(),
  signToken: vi.fn(() => "mock-token"),
}));

vi.mock("../../lib/rate-limit", () => ({
  recordSignupAttempt: vi.fn(),
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
});
