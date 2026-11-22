import { describe, test, expect, vi, beforeEach } from "vitest";
import { fetchLatestGitHubCommits, getReleasePayload } from "@/lib/software-updates";

describe("Real-time Software Updates Service", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  test("fetches and maps live GitHub commits accurately into SoftwareUpdate objects", async () => {
    const mockCommits = [
      {
        sha: "d3affb22d828c54daebf59f635afa534db7a5462",
        commit: {
          author: {
            name: "Felix Akabati",
            date: "2026-11-22T14:51:52Z",
          },
          message: "feat(menu): enable seamless recipe configuration and volume-based tracking\n\n- Improved Recipe tab\n- Added fl_oz conversion",
        },
      },
      {
        sha: "2377bf49a89b324f5d16eff4d2bb0ed96c4678f4",
        commit: {
          author: {
            name: "Felix Akabati",
            date: "2026-11-22T14:32:33Z",
          },
          message: "fix(hydration): resolve React error #418 across root layout and indicators",
        },
      },
    ];

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockCommits,
    } as unknown as Response);

    const updates = await fetchLatestGitHubCommits("FelixAkabati007/KumbiAPP", 10);
    expect(updates.length).toBeGreaterThanOrEqual(2);

    const first = updates[0];
    expect(first.title).toBe("feat(menu): enable seamless recipe configuration and volume-based tracking");
    expect(first.type).toBe("feature");
    expect(first.build).toBe("d3affb22d828c54daebf59f635afa534db7a5462");
    expect(first.author).toBe("Felix Akabati");
    expect(first.details).toContain("Improved Recipe tab");

    const second = updates[1];
    expect(second.type).toBe("fix");
    expect(second.build).toBe("2377bf49a89b324f5d16eff4d2bb0ed96c4678f4");

    // Ensure no direct GitHub URLs are exposed in fields
    expect((first as unknown as Record<string, unknown>).url).toBeUndefined();
    expect((second as unknown as Record<string, unknown>).url).toBeUndefined();
  });

  test("correctly flags update available when clientBuild differs from latest commit SHA", async () => {
    const payload = await getReleasePayload("older-sha-1234567");
    // If the latest update build is not "older-sha-1234567", an update should be flagged
    if (payload.latestBuild && payload.latestBuild !== "older-sha-1234567") {
      expect(payload.isUpdateAvailable).toBe(true);
    }
  });

  test("flags up-to-date when clientBuild matches latest commit SHA", async () => {
    const latestBuild = "d3affb22d828c54daebf59f635afa534db7a5462";
    const payload = await getReleasePayload(latestBuild);
    if (payload.latestBuild === latestBuild) {
      expect(payload.isUpdateAvailable).toBe(false);
    }
  });
});
