import { describe, it, expect } from "vitest";
import { POST as verifyPost } from "../../app/api/auth/verify-email/route";

describe("Verify Email API validation", () => {
  it("rejects missing token/email", async () => {
    const req = new Request("http://localhost/api/auth/verify-email", {
      method: "POST",
      body: JSON.stringify({}),
      headers: { "Content-Type": "application/json" },
    });
    const res = await verifyPost(req);
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.code).toBe("validation_error");
  });
});
