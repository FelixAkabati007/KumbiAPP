import { describe, test, expect } from "vitest";
import {
  getThemePreference,
  setThemePreference,
  applyTheme,
} from "@/lib/theme-manager";

describe("theme storage", () => {
  test("stores and reads preference with expiry", () => {
    setThemePreference("light", undefined, 0.0001);
    const pref = getThemePreference();
    expect(pref?.key).toBe("light");
  });

  test("applyTheme sets high contrast class", () => {
    applyTheme("hc");
    expect(document.documentElement.classList.contains("hc")).toBe(true);
  });
});
