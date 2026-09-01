export type DeviceCapability = "serial" | "usb"

export type DeviceCapabilityStatus = {
  capability: DeviceCapability
  supported: boolean
  label: string
  guidance: string
}

export function getDeviceCapabilities(): DeviceCapabilityStatus[] {
  const scope = globalThis as typeof globalThis & {
    navigator?: Navigator & { usb?: unknown }
  }

  return [
    {
      capability: "serial",
      supported: typeof scope.navigator?.serial !== "undefined",
      label: "Web Serial",
      guidance: "Use a Chromium-based browser over HTTPS, then allow the device when prompted.",
    },
    {
      capability: "usb",
      supported: typeof scope.navigator?.usb !== "undefined",
      label: "WebUSB",
      guidance: "Use a Chromium-based browser over HTTPS and connect a supported USB peripheral.",
    },
  ]
}

export function getUnsupportedDeviceMessage(capability: DeviceCapability): string {
  return getDeviceCapabilities().find((item) => item.capability === capability)?.guidance ?? "This device connection is not supported by the current browser."
}

export async function requestSerialDevice(): Promise<unknown> {
  const serial = (globalThis.navigator as Navigator & { serial?: { requestPort(): Promise<unknown> } } | undefined)?.serial
  if (!serial) throw new Error(getUnsupportedDeviceMessage("serial"))
  return serial.requestPort()
}

export async function requestUsbDevice(filters: USBDeviceFilter[] = []): Promise<unknown> {
  const usb = (globalThis.navigator as Navigator & { usb?: { requestDevice(options: { filters: USBDeviceFilter[] }): Promise<unknown> } } | undefined)?.usb
  if (!usb) throw new Error(getUnsupportedDeviceMessage("usb"))
  return usb.requestDevice({ filters })
}

export function isDeviceConnectionError(error: unknown): boolean {
  return error instanceof DOMException && ["NotAllowedError", "NotFoundError", "SecurityError"].includes(error.name)
}

type USBDeviceFilter = { vendorId?: number; productId?: number }

declare global {
  interface Navigator {
    serial?: unknown
    usb?: unknown
  }
}

export {}
