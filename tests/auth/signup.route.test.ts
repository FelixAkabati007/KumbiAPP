import { describe, it, expect } from "vitest";
import { POST as signupPost } from "../../app/api/auth/signup/route";

describe("Signup API hardening", () => {
  it("rejects public account creation", async () => {
    const req = new Request("http://localhost/api/auth/signup", {
      method: "POST",
      body: JSON.stringify({ email: "new@test.com", password: "Password123", name: "New User" }),
      headers: { "Content-Type": "application/json" },
    });

    const res = await signupPost(req);
    const body = await res.json();
    expect(res.status).toBe(403);
    expect(body.code).toBe("staff_account_creation_only");
  });
});
