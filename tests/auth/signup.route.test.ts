import { describe, it, expect, vi, beforeEach } from "vitest";
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
        username: "foo",
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
        username: "foo",
      }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await signupPost(req);
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.code).toBe("validation_error");
  });
});
