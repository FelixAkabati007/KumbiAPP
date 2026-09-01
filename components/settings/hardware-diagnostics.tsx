"use client"

import { useMemo, useState } from "react"
import { CheckCircle2, CircleAlert, HardDrive, Plug, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { getDeviceCapabilities, requestSerialDevice, requestUsbDevice, type DeviceCapability } from "@/lib/device-capabilities"

const devices = ["Thermal printer", "Cash drawer", "Barcode scanner", "Customer display", "Card terminal"] as const

export function HardwareDiagnostics() {
  const [refreshKey, setRefreshKey] = useState(0)
  const [message, setMessage] = useState<string | null>(null)
  const capabilities = useMemo(() => getDeviceCapabilities(), [refreshKey])

  async function connect(capability: DeviceCapability) {
    setMessage(null)
    try {
      if (capability === "serial") await requestSerialDevice()
      else await requestUsbDevice()
      setMessage(`${capability === "serial" ? "Web Serial" : "WebUSB"} permission granted. Test the device from its driver or peripheral panel.`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The device could not be connected.")
    }
  }

  return (
    <Card className="border-orange-200 dark:border-orange-800">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><HardDrive className="h-5 w-5 text-primary" aria-hidden="true" />Hardware diagnostics</CardTitle>
        <CardDescription>Check browser support before connecting POS peripherals. Unsupported devices do not block other settings.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {devices.map((device) => <div key={device} className="flex items-center gap-3 rounded-lg border p-3"><CircleAlert className="h-4 w-4 text-muted-foreground" aria-hidden="true" /><div><p className="text-sm font-medium">{device}</p><p className="text-xs text-muted-foreground">Configuration available</p></div></div>)}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {capabilities.map((item) => <div key={item.capability} className="rounded-lg border bg-muted/20 p-4"><div className="flex items-center justify-between gap-3"><div><p className="font-medium">{item.label}</p><p className="text-xs text-muted-foreground">{item.supported ? "Available in this browser" : "Not available in this browser"}</p></div>{item.supported ? <CheckCircle2 className="h-5 w-5 text-primary" aria-label="Supported" /> : <CircleAlert className="h-5 w-5 text-muted-foreground" aria-label="Unsupported" />}</div><p className="mt-2 text-xs leading-5 text-muted-foreground">{item.guidance}</p><Button className="mt-3 w-full" variant="outline" size="sm" onClick={() => void connect(item.capability)} disabled={!item.supported}><Plug className="mr-2 h-4 w-4" aria-hidden="true" />Connect {item.label}</Button></div>)}
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><p className="text-sm text-muted-foreground" aria-live="polite">{message ?? "No connection attempt made."}</p><Button variant="ghost" size="sm" onClick={() => setRefreshKey((value) => value + 1)}><RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />Refresh capabilities</Button></div>
      </CardContent>
    </Card>
  )
}
