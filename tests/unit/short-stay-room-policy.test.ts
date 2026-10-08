import { describe, expect, it } from "vitest";
import { isShortStayRoom, isShortStayRoomNumber, SHORT_STAY_DURATION_MINUTES } from "@/lib/hotels/short-stay";

describe("short-stay room policy", () => {
  it("limits the 130-minute policy to Rooms 19 and 20", () => {
    expect(SHORT_STAY_DURATION_MINUTES).toBe(130);
    expect(isShortStayRoomNumber("19")).toBe(true);
    expect(isShortStayRoomNumber("20")).toBe(true);
    expect(isShortStayRoomNumber("18")).toBe(false);
    expect(isShortStayRoomNumber("21")).toBe(false);
  });

  it("requires both the designated room and short-stay room type", () => {
    expect(isShortStayRoom("19", "Short Time")).toBe(true);
    expect(isShortStayRoom("20", "Short Stay")).toBe(true);
    expect(isShortStayRoom("18", "Short Time")).toBe(false);
    expect(isShortStayRoom("19", "Deluxe Room")).toBe(false);
  });
});
