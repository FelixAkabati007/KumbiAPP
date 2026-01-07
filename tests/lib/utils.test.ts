import { describe, it, expect } from "vitest";
import { cn } from "../../lib/utils";

describe("cn utility", () => {
  it("merges tailwind classes correctly", () => {
    expect(cn("p-2", "p-4", "text-sm")).toBe("p-4 text-sm");
  });
  it("handles conditional classes", () => {
    const active = true;
    expect(cn("p-2", active && "font-bold")).toContain("font-bold");
  });
});
