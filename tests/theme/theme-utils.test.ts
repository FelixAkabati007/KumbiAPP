import { describe, test, expect, vi } from "vitest";
import {
  getThemePreference,
  setThemePreference,
  applyTheme,
} from "@/lib/theme-manager";

describe("theme storage", () => {
  test("dispatches themeChanged event with expiry", () => {
    const handler = vi.fn();
    window.addEventListener("themeChanged", handler as EventListener);

    setThemePreference("light", undefined, 0.0001);

    expect(handler).toHaveBeenCalledTimes(1);
    const evt = handler.mock.calls[0]?.[0] as CustomEvent;
    expect(evt.detail.key).toBe("light");

    const pref = getThemePreference();
    expect(pref).toBeNull();

    window.removeEventListener("themeChanged", handler as EventListener);
  });

  test("applyTheme sets high contrast class", () => {
    applyTheme("hc");
    expect(document.documentElement.classList.contains("hc")).toBe(true);
  });
});
