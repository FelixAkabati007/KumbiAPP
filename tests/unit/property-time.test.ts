import { describe, expect, it } from "vitest";
import { addHotelBookingWindow, isHotelWindowOverdue } from "@/lib/property-time";

describe("Accra hotel booking windows", () => {
  it.each([
    ["midnight", "2026-05-10T00:00:00.000Z", "2026-05-11T00:00:00.000Z"],
    ["daylight", "2026-05-10T10:00:00.000Z", "2026-05-11T10:00:00.000Z"],
    ["late night", "2026-05-10T22:00:00.000Z", "2026-05-11T22:00:00.000Z"],
  ])("expires exactly 24 hours after %s check-in", (_, checkIn, expected) => {
    expect(addHotelBookingWindow(checkIn).toISOString()).toBe(expected);
  });

  it("allows early checkout before the 24-hour boundary", () => {
    expect(isHotelWindowOverdue("2026-05-10T22:00:00.000Z", new Date("2026-05-11T09:00:00.000Z"))).toBe(false);
    expect(isHotelWindowOverdue("2026-05-10T22:00:00.000Z", new Date("2026-05-11T22:00:00.000Z"))).toBe(true);
  });
});
