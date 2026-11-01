"use client";

import { useState, useEffect, useCallback } from "react";
import {
  CheckCircle2,
  CircleAlert,
  HardDrive,
  Plug,
  RefreshCw,
  Printer,
  DollarSign,
  Scan,
  Activity,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  getDeviceCapabilities,
  requestSerialDevice,
  requestUsbDevice,
  type DeviceCapability,
} from "@/lib/device-capabilities";
import { useToast } from "@/hooks/use-toast";

interface HardwareStatusResponse {
  timestamp: string;
  printer: {
    name: string;
    enabled: boolean;
    interfaceType: string;
    target: string;
    status: "online" | "offline" | "disabled" | "bridge_required";
    latencyMs?: number;
    error?: string | null;
    details?: string;
  };
  cashDrawer: {
    enabled: boolean;
    status: "ready" | "disabled" | "printer_offline";
    port: string;
    mode: string;
    details: string;
  };
  barcodeScanner: {
    enabled: boolean;
    status: "ready" | "disabled";
    mode: string;
    port: string;
    details: string;
  };
  printBridge: {
    url: string;
    online: boolean;
  };
}

export function HardwareDiagnostics() {
  const [capabilities, setCapabilities] = useState(() => getDeviceCapabilities());
  const [status, setStatus] = useState<HardwareStatusResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [drawerTesting, setDrawerTesting] = useState(false);
  const [testBarcode, setTestBarcode] = useState("");
  const [lastScannedResult, setLastScannedResult] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const { toast } = useToast();

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/hardware/status");
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
      }
    } catch (err) {
      console.warn("Could not fetch hardware status:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  async function connect(capability: DeviceCapability) {
    setMessage(null);
    try {
      if (capability === "serial") await requestSerialDevice();
      else await requestUsbDevice();
      setMessage(
        `${capability === "serial" ? "Web Serial" : "WebUSB"} permission granted. Device is now accessible.`
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "The device could not be connected."
      );
    }
  }

  async function handleTestDrawerKick() {
    setDrawerTesting(true);
    try {
      const res = await fetch("/api/hardware/cash-drawer/open", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        toast({
          title: "Cash Drawer Kick Sent",
          description: data.message || "Signal sent to thermal printer kick port (RJ11/RJ12).",
        });
      } else {
        toast({
          title: "Drawer Kick Failed",
          description: data.error || "Unable to send drawer kick signal.",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Test Error",
        description: error instanceof Error ? error.message : "Failed to trigger cash drawer.",
        variant: "destructive",
      });
    } finally {
      setDrawerTesting(false);
    }
  }

  function handleBarcodeKeydown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && testBarcode.trim()) {
      e.preventDefault();
      setLastScannedResult(`Captured: "${testBarcode.trim()}" at ${new Date().toLocaleTimeString()}`);
      toast({
        title: "Barcode Scanner Verified",
        description: `Successfully read barcode: ${testBarcode.trim()}`,
      });
      setTestBarcode("");
    }
  }

  const getStatusBadge = (statusType: string) => {
    switch (statusType) {
      case "online":
      case "ready":
        return <Badge className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium">Online / Ready</Badge>;
      case "bridge_required":
        return <Badge className="bg-amber-600 hover:bg-amber-700 text-white font-medium">Bridge Required</Badge>;
      case "offline":
      case "printer_offline":
        return <Badge variant="destructive">Offline</Badge>;
      default:
        return <Badge variant="secondary">Disabled</Badge>;
    }
  };

  return (
    <Card className="border-orange-200 dark:border-orange-800 shadow-md">
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <HardDrive className="h-5 w-5 text-orange-600 dark:text-orange-400" aria-hidden="true" />
              Hardware Diagnostics & Live Peripheral Status
            </CardTitle>
            <CardDescription>
              Verify real connectivity for receipt printers, cash drawer kick ports, and barcode scanners.
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setCapabilities(getDeviceCapabilities());
              fetchStatus();
            }}
            disabled={loading}
            className="border-orange-200 text-orange-700 hover:bg-orange-50 dark:border-orange-700 dark:text-orange-300"
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} aria-hidden="true" />
            Check Live Hardware
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Live Peripheral Status Grid */}
        <div className="grid gap-4 sm:grid-cols-3">
          {/* Thermal Printer Card */}
          <div className="rounded-xl border border-orange-200/80 bg-white/50 dark:bg-gray-800/50 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Printer className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                <span className="font-semibold text-sm">Thermal Printer</span>
              </div>
              {getStatusBadge(status?.printer.status || "disabled")}
            </div>
            <p className="text-xs text-muted-foreground">
              {status?.printer.target ? `Target: ${status.printer.target}` : "Not configured"}
              {status?.printer.latencyMs ? ` · ${status.printer.latencyMs}ms latency` : ""}
            </p>
            {status?.printer.details && (
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-tight">
                {status.printer.details}
              </p>
            )}
            {status?.printer.error && (
              <p className="text-[11px] text-red-500 leading-tight">{status.printer.error}</p>
            )}
          </div>

          {/* Cash Drawer Card */}
          <div className="rounded-xl border border-orange-200/80 bg-white/50 dark:bg-gray-800/50 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                <span className="font-semibold text-sm">Cash Drawer</span>
              </div>
              {getStatusBadge(status?.cashDrawer.status || "disabled")}
            </div>
            <p className="text-xs text-muted-foreground">
              {status?.cashDrawer.port ? `Port: ${status.cashDrawer.port}` : "RJ11 Drawer Kick"}
            </p>
            <Button
              variant="outline"
              size="sm"
              className="w-full text-xs h-7 border-emerald-300 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
              onClick={handleTestDrawerKick}
              disabled={drawerTesting || !status?.cashDrawer.enabled}
            >
              {drawerTesting ? "Sending Kick..." : "Test Drawer Kick"}
            </Button>
          </div>

          {/* Barcode Scanner Card */}
          <div className="rounded-xl border border-orange-200/80 bg-white/50 dark:bg-gray-800/50 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Scan className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                <span className="font-semibold text-sm">Barcode Scanner</span>
              </div>
              {getStatusBadge(status?.barcodeScanner.status || "disabled")}
            </div>
            <p className="text-xs text-muted-foreground">
              Mode: {status?.barcodeScanner.mode === "usb_hid" ? "USB Keyboard Wedge" : "Serial"}
            </p>
            <div className="space-y-1">
              <Input
                placeholder="Zap barcode here to test..."
                value={testBarcode}
                onChange={(e) => setTestBarcode(e.target.value)}
                onKeyDown={handleBarcodeKeydown}
                className="h-7 text-xs bg-white dark:bg-gray-900"
              />
              {lastScannedResult && (
                <p className="text-[11px] text-emerald-600 dark:text-emerald-400 truncate font-mono">
                  {lastScannedResult}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Compatibility and WebSerial / WebUSB Section */}
        <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-4 text-sm leading-5 text-blue-900 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-100">
          <p className="font-semibold flex items-center gap-2">
            <Activity className="h-4 w-4" /> POS Peripheral Connection Standards
          </p>
          <p className="mt-1 text-xs">
            Network thermal printers connect directly over TCP port 9100. Standard cash drawers plug into the thermal printer RJ11/RJ12 drawer kick socket. USB & Bluetooth barcode scanners work out-of-the-box as HID keyboards.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {capabilities.map((item) => (
            <div key={item.capability} className="rounded-lg border bg-muted/20 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-medium">{item.label}</p>
                  <p className="text-xs text-muted-foreground">
                    {item.supported ? "Available in this browser" : "Not available in this browser"}
                  </p>
                </div>
                {item.supported ? (
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" aria-label="Supported" />
                ) : (
                  <CircleAlert className="h-5 w-5 text-muted-foreground" aria-label="Unsupported" />
                )}
              </div>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">{item.guidance}</p>
              <Button
                className="mt-3 w-full"
                variant="outline"
                size="sm"
                onClick={() => void connect(item.capability)}
                disabled={!item.supported}
              >
                <Plug className="mr-2 h-4 w-4" aria-hidden="true" />
                Grant {item.label} Access
              </Button>
            </div>
          ))}
        </div>

        {message && (
          <p className="text-xs text-zinc-600 dark:text-zinc-400" aria-live="polite">
            {message}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
