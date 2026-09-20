import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "../../app/api/menu/upload/route";

const { getSession, put } = vi.hoisted(() => ({
  getSession: vi.fn(),
  put: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getSession }));
vi.mock("@vercel/blob", () => ({ put }));

function requestWithFile(file?: File) {
  const formData = new FormData();
  if (file) formData.append("file", file);
  return {
    formData: async () => formData,
  } as unknown as Request;
}

describe("Menu image upload API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSession.mockResolvedValue({ role: "restaurantManager" });
    put.mockResolvedValue({ url: "https://blob.vercel-storage.com/menu-items/test.png" });
  });

  it("rejects unauthenticated or unauthorized users", async () => {
    getSession.mockResolvedValueOnce(null);
    const unauthenticated = await POST(requestWithFile(new File(["png"], "menu.png", { type: "image/png" })));
    expect(unauthenticated.status).toBe(403);

    getSession.mockResolvedValueOnce({ role: "staff" });
    const unauthorized = await POST(requestWithFile(new File(["png"], "menu.png", { type: "image/png" })));
    expect(unauthorized.status).toBe(403);
    expect(put).not.toHaveBeenCalled();
  });

  it("rejects missing and unsupported files", async () => {
    const missing = await POST(requestWithFile());
    expect(missing.status).toBe(400);

    const unsupported = await POST(requestWithFile(new File(["text"], "menu.txt", { type: "text/plain" })));
    expect(unsupported.status).toBe(400);
    expect(put).not.toHaveBeenCalled();
  });

  it("rejects files larger than 5MB", async () => {
    const oversized = new File([new Uint8Array(5 * 1024 * 1024 + 1)], "large.png", { type: "image/png" });
    const response = await POST(requestWithFile(oversized));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain("5MB");
    expect(put).not.toHaveBeenCalled();
  });

  it("uploads valid images to Blob and returns the persisted URL", async () => {
    const file = new File(["png"], "menu.png", { type: "image/png" });
    const response = await POST(requestWithFile(file));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.url).toBe("https://blob.vercel-storage.com/menu-items/test.png");
    expect(put).toHaveBeenCalledTimes(1);
    expect(put.mock.calls[0][0]).toMatch(/^menu-items\/.+\.png$/);
    expect(put.mock.calls[0][2]).toMatchObject({ access: "public", contentType: "image/png", addRandomSuffix: false });
  });

  it("returns a safe error when Blob upload fails", async () => {
    put.mockRejectedValueOnce(new Error("storage unavailable"));
    const response = await POST(requestWithFile(new File(["png"], "menu.png", { type: "image/png" })));
    expect(response.status).toBe(500);
    expect((await response.json()).error).toBe("Failed to upload menu image");
  });
});
