import { describe, expect, it } from "vitest"
import { getDeviceCapabilities, getUnsupportedDeviceMessage } from "@/lib/device-capabilities"

describe("device capabilities", () => {
  it("reports serial and USB capability statuses without throwing", () => {
    const capabilities = getDeviceCapabilities()
    expect(capabilities.map((item) => item.capability)).toEqual(["serial", "usb"])
    expect(capabilities.every((item) => typeof item.supported === "boolean")).toBe(true)
  })

  it("provides actionable guidance for unsupported connections", () => {
    expect(getUnsupportedDeviceMessage("serial")).toContain("Chromium")
    expect(getUnsupportedDeviceMessage("usb")).toContain("HTTPS")
  })
})
