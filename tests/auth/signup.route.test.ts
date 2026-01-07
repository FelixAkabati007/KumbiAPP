import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { POST as signupPost } from "../../app/api/auth/signup/route";

vi.mock("../../lib/db", () => ({
  query: vi.fn(async () => ({ rows: [] })),
}));

vi.mock("../../lib/email", () => ({
  sendEmail: vi.fn(async () => ({ success: true })),
  buildVerificationEmail: vi.fn((link: string) => ({
    subject: "Verify",
    text: `Verify: ${link}`,
    html: `<a href="${link}">Verify</a>`,
  })),
}));

vi.mock("../../lib/rate-limit", () => ({
  recordSignupAttempt: vi.fn(async () => {}),
  isRateLimited: vi.fn(async () => false),
}));

describe("Signup API validation", () => {
  beforeEach(() => {
    // reset mocks
    vi.clearAllMocks();
  });

  it("rejects missing fields", async () => {
    const req = new Request("http://localhost/api/auth/signup", {
      method: "POST",
      body: JSON.stringify({ email: "", password: "", name: "" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await signupPost(req);
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.code).toBe("validation_error");
  });

  it("rejects invalid email", async () => {
    const req = new Request("http://localhost/api/auth/signup", {
      method: "POST",
      body: JSON.stringify({
        email: "bad@",
        password: "Aa123456",
        name: "Foo",
        role: "staff",
      }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await signupPost(req);
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.code).toBe("validation_error");
  });

  it("rejects weak password", async () => {
    const req = new Request("http://localhost/api/auth/signup", {
      method: "POST",
      body: JSON.stringify({
        email: "a@b.com",
        password: "weak",
        name: "Foo",
        role: "staff",
      }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await signupPost(req);
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.code).toBe("validation_error");
  });

  it("rejects duplicate email", async () => {
    // Mock existing user
    const { query } = await import("../../lib/db");
    // @ts-expect-error: mocking
    query.mockResolvedValueOnce({ rows: [{ id: "existing" }] });

    const req = new Request("http://localhost/api/auth/signup", {
      method: "POST",
      body: JSON.stringify({
        email: "exists@test.com",
        password: "Password123",
        name: "Existing User",
      }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await signupPost(req);
    const body = await res.json();
    expect(res.status).toBe(409);
    expect(body.code).toBe("conflict");
  });

  it("registers valid user successfully", async () => {
    // Mock no existing user, then insert success
    const { query } = await import("../../lib/db");
    (query as unknown as Mock)
      .mockResolvedValueOnce({ rows: [] }) // check existence
      .mockResolvedValueOnce({
        rows: [
          {
            id: "new-user",
            email: "new@test.com",
            name: "New User",
            role: "staff",
          },
        ],
      }) // insert user
      .mockResolvedValueOnce({ rows: [] }); // insert token

    const req = new Request("http://localhost/api/auth/signup", {
      method: "POST",
      body: JSON.stringify({
        email: "new@test.com",
        password: "Password123",
        name: "New User",
      }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await signupPost(req);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.message).toContain("Please return to Sign In page");
  });
});
