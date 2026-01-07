"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { getBarcodeScannerService } from "@/lib/barcode-scanner";
import type { BarcodeScannerStatus, BarcodeData } from "@/lib/barcode-scanner";
import { getSettings } from "@/lib/settings";
import {
  testBarcodeScanner,
  configureBarcodeScanner,
} from "@/lib/barcode-scanner";
// Removed unused BarcodeScannerConfig type import
import {
  QrCode,
  Power,
  PowerOff,
  AlertCircle,
  Volume2,
  VolumeX,
  Settings,
  TestTube,
  Scan,
  RotateCcw,
} from "lucide-react";

export function BarcodeScannerTest() {
  const { toast } = useToast();
  const [status, setStatus] = useState<BarcodeScannerStatus>({
    isConnected: false,
    isScanning: false,
    lastScanned: null,
    lastScannedAt: null,
    error: null,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [settings] = useState(getSettings());
  const [testBarcode, setTestBarcode] = useState("123456789012");
  const [scanHistory, setScanHistory] = useState<BarcodeData[]>([]);

  useEffect(() => {
    // Initialize barcode scanner service
    const initializeScanner = async () => {
      if (settings.system.barcodeScanner?.enabled) {
        try {
          const service = getBarcodeScannerService(
            settings.system.barcodeScanner,
          );

          // Subscribe to status changes
          const unsubscribeStatus = service.onStatusChange((newStatus) => {
            setStatus(newStatus);
          });

          // Subscribe to barcode data
          const unsubscribeData = service.onBarcodeData((data) => {
            setScanHistory((prev) => [data, ...prev.slice(0, 9)]); // Keep last 10 scans
            toast({
              title: "Barcode Scanned",
              description: `${data.code} (${data.type})`,
            });
          });

          // Connect to scanner
          await service.connect();

          return () => {
            unsubscribeStatus();
            unsubscribeData();
          };
        } catch (error) {
          console.error("Failed to initialize barcode scanner:", error);
          setStatus((prev) => ({
            ...prev,
            error: "Failed to initialize barcode scanner",
          }));
        }
      }
    };

    const cleanup = initializeScanner();

    // Cleanup on unmount
    return () => {
      if (cleanup) {
        cleanup.then((cleanupFn) => cleanupFn && cleanupFn());
      }
    };
  }, [settings.system.barcodeScanner, toast]);

  const handleTestConnection = async () => {
    if (!settings.system.barcodeScanner?.enabled) {
      toast({
        title: "Barcode Scanner Disabled",
        description: "Please enable barcode scanner in settings first",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      const success = await testBarcodeScanner(settings.system.barcodeScanner);

      if (success) {
        toast({
          title: "Test Successful",
          description: "Barcode scanner is working correctly",
        });
      } else {
        toast({
          title: "Test Failed",
          description: "Please check your barcode scanner configuration",
          variant: "destructive",
        });
      }
    } catch {
      toast({
        title: "Test Error",
        description: "Failed to test barcode scanner",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfigureScanner = async () => {
    if (!settings.system.barcodeScanner?.enabled) {
      toast({
        title: "Barcode Scanner Disabled",
        description: "Please enable barcode scanner in settings first",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      const success = await configureBarcodeScanner(
        settings.system.barcodeScanner,
      );

      if (success) {
        toast({
          title: "Configuration Successful",
          description: "Barcode scanner has been configured",
        });
      } else {
        toast({
          title: "Configuration Failed",
          description: "Failed to configure barcode scanner",
          variant: "destructive",
        });
      }
    } catch {
      toast({
        title: "Configuration Error",
        description: "Failed to configure barcode scanner",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSimulateScan = () => {
    if (!settings.system.barcodeScanner?.enabled) {
      toast({
        title: "Barcode Scanner Disabled",
        description: "Please enable barcode scanner in settings first",
        variant: "destructive",
      });
      return;
    }

    if (!testBarcode.trim()) {
      toast({
        title: "Invalid Barcode",
        description: "Please enter a test barcode",
        variant: "destructive",
      });
      return;
    }

    try {
      const service = getBarcodeScannerService(settings.system.barcodeScanner);
      service.simulateScan(testBarcode);

      toast({
        title: "Scan Simulated",
        description: `Simulated scan of: ${testBarcode}`,
      });
    } catch {
      toast({
        title: "Simulation Error",
        description: "Failed to simulate scan",
        variant: "destructive",
      });
    }
  };

  const handleReconnect = async () => {
    setIsLoading(true);
    try {
      const service = getBarcodeScannerService(settings.system.barcodeScanner);
      const success = await service.connect();

      if (success) {
        toast({
          title: "Reconnected",
          description: "Successfully connected to barcode scanner",
        });
      } else {
        toast({
          title: "Connection Failed",
          description: "Could not connect to barcode scanner",
          variant: "destructive",
        });
      }
    } catch {
      toast({
        title: "Connection Error",
        description: "Failed to reconnect to barcode scanner",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearHistory = () => {
    setScanHistory([]);
    toast({
      title: "History Cleared",
      description: "Scan history has been cleared",
    });
  };

  if (!settings.system.barcodeScanner?.enabled) {
    return (
      <Card className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm border border-orange-200 dark:border-orange-700 rounded-3xl shadow-xl">
        <CardHeader className="rounded-t-3xl bg-gradient-to-r from-orange-500/10 via-amber-500/10 to-yellow-500/10 dark:from-orange-400/10 dark:via-amber-400/10 dark:to-yellow-400/10">
          <CardTitle className="flex items-center gap-2 text-lg text-gray-800 dark:text-gray-200">
            <div className="p-2 bg-gradient-to-br from-orange-500 via-amber-500 to-yellow-500 rounded-full shadow-lg">
              <QrCode className="h-5 w-5 text-white" />
            </div>
            Barcode Scanner Test
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          <div className="text-center py-8">
            <PowerOff className="h-12 w-12 mx-auto text-gray-400 mb-4" />
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              Barcode scanner is currently disabled
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-500">
              Enable it in Settings → System → Barcode Scanner Configuration
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm border border-orange-200 dark:border-orange-700 rounded-3xl shadow-xl">
      <CardHeader className="rounded-t-3xl bg-gradient-to-r from-orange-500/10 via-amber-500/10 to-yellow-500/10 dark:from-orange-400/10 dark:via-amber-400/10 dark:to-yellow-400/10">
        <CardTitle className="flex items-center gap-2 text-lg text-gray-800 dark:text-gray-200">
          <div className="p-2 bg-gradient-to-br from-orange-500 via-amber-500 to-yellow-500 rounded-full shadow-lg">
            <QrCode className="h-5 w-5 text-white" />
          </div>
          Barcode Scanner Test
        </CardTitle>
      </CardHeader>
      <CardContent className="p-6 space-y-6">
        {/* Status Display */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex items-center gap-3 p-4 bg-gradient-to-r from-orange-50 via-amber-50 to-yellow-50 dark:from-orange-900/30 dark:via-amber-900/30 dark:to-yellow-900/30 rounded-2xl border border-orange-200 dark:border-orange-700">
            <div className="p-2 bg-gradient-to-br from-orange-500 via-amber-500 to-yellow-500 rounded-full shadow-lg">
              {status.isConnected ? (
                <Power className="h-4 w-4 text-white" />
              ) : (
                <PowerOff className="h-4 w-4 text-white" />
              )}
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Connection Status
              </p>
              <Badge
                variant={status.isConnected ? "default" : "secondary"}
                className={`${
                  status.isConnected
                    ? "bg-green-100 text-green-800 border-green-200 dark:bg-green-900/20 dark:text-green-300 dark:border-green-700"
                    : "bg-red-100 text-red-800 border-red-200 dark:bg-red-900/20 dark:text-red-300 dark:border-red-700"
                }`}
              >
                {status.isConnected ? "Connected" : "Disconnected"}
              </Badge>
            </div>
          </div>

          <div className="flex items-center gap-3 p-4 bg-gradient-to-r from-orange-50 via-amber-50 to-yellow-50 dark:from-orange-900/30 dark:via-amber-900/30 dark:to-yellow-900/30 rounded-2xl border border-orange-200 dark:border-orange-700">
            <div className="p-2 bg-gradient-to-br from-orange-500 via-amber-500 to-yellow-500 rounded-full shadow-lg">
              {status.isScanning ? (
                <Scan className="h-4 w-4 text-white animate-pulse" />
              ) : (
                <QrCode className="h-4 w-4 text-white" />
              )}
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Scanner Status
              </p>
              <Badge
                variant={status.isScanning ? "destructive" : "default"}
                className={`${
                  status.isScanning
                    ? "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-700"
                    : "bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-900/20 dark:text-gray-300 dark:border-gray-700"
                }`}
              >
                {status.isScanning ? "Scanning" : "Ready"}
              </Badge>
            </div>
          </div>
        </div>

        {/* Last Scan Info */}
        {status.lastScanned && (
          <div className="flex items-center gap-3 p-4 bg-gradient-to-r from-blue-50 via-indigo-50 to-purple-50 dark:from-blue-900/30 dark:via-indigo-900/30 dark:to-purple-900/30 rounded-2xl border border-blue-200 dark:border-blue-700">
            <div className="p-2 bg-gradient-to-br from-blue-500 via-indigo-500 to-purple-500 rounded-full shadow-lg">
              <QrCode className="h-4 w-4 text-white" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Last Scanned
              </p>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {status.lastScanned} at{" "}
                {status.lastScannedAt?.toLocaleTimeString()}
              </p>
            </div>
          </div>
        )}

        {/* Error Display */}
        {status.error && (
          <div className="flex items-center gap-3 p-4 bg-gradient-to-r from-red-50 via-pink-50 to-rose-50 dark:from-red-900/30 dark:via-pink-900/30 dark:to-rose-900/30 rounded-2xl border border-red-200 dark:border-red-700">
            <div className="p-2 bg-gradient-to-br from-red-500 via-pink-500 to-rose-500 rounded-full shadow-lg">
              <AlertCircle className="h-4 w-4 text-white" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Error
              </p>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {status.error}
              </p>
            </div>
          </div>
        )}

        {/* Configuration Info */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="text-center p-3 bg-gradient-to-r from-gray-50 to-slate-50 dark:from-gray-900/30 dark:to-slate-900/30 rounded-2xl border border-gray-200 dark:border-gray-700">
            <p className="text-xs text-gray-500 dark:text-gray-400">Port</p>
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
              {settings.system.barcodeScanner?.port || "COM2"}
            </p>
          </div>
          <div className="text-center p-3 bg-gradient-to-r from-gray-50 to-slate-50 dark:from-gray-900/30 dark:to-slate-900/30 rounded-2xl border border-gray-200 dark:border-gray-700">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Baud Rate
            </p>
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
              {settings.system.barcodeScanner?.baudRate || 9600}
            </p>
          </div>
          <div className="text-center p-3 bg-gradient-to-r from-gray-50 to-slate-50 dark:from-gray-900/30 dark:to-slate-900/30 rounded-2xl border border-gray-200 dark:border-gray-700">
            <p className="text-xs text-gray-500 dark:text-gray-400">Sound</p>
            <div className="flex justify-center">
              {settings.system.barcodeScanner?.soundEnabled ? (
                <Volume2 className="h-4 w-4 text-green-600 dark:text-green-400" />
              ) : (
                <VolumeX className="h-4 w-4 text-gray-400" />
              )}
            </div>
          </div>
        </div>

        {/* Test Controls */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-3">
            <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Test Barcode
            </Label>
            <div className="flex gap-2">
              <Input
                value={testBarcode}
                onChange={(e) => setTestBarcode(e.target.value)}
                placeholder="Enter test barcode"
                className="flex-1 rounded-2xl border-orange-200 dark:border-orange-700 focus:border-orange-500 dark:focus:border-orange-400 bg-white/50 dark:bg-gray-800/50"
              />
              <Button
                onClick={handleSimulateScan}
                disabled={isLoading}
                className="rounded-2xl bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600 text-white shadow-lg"
              >
                <Scan className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="space-y-3">
            <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Quick Actions
            </Label>
            <div className="flex gap-2">
              <Button
                onClick={handleTestConnection}
                disabled={isLoading}
                variant="outline"
                className="flex-1 rounded-2xl border-orange-200 dark:border-orange-700 hover:bg-orange-50 dark:hover:bg-orange-900/20 text-orange-700 dark:text-orange-300"
              >
                <TestTube className="mr-2 h-4 w-4" />
                Test
              </Button>
              <Button
                onClick={handleConfigureScanner}
                disabled={isLoading}
                variant="outline"
                className="flex-1 rounded-2xl border-blue-200 dark:border-blue-700 hover:bg-blue-50 dark:hover:bg-blue-900/20 text-blue-700 dark:text-blue-300"
              >
                <Settings className="mr-2 h-4 w-4" />
                Configure
              </Button>
            </div>
          </div>
        </div>

        {/* Control Buttons */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Button
            onClick={handleReconnect}
            disabled={isLoading}
            variant="outline"
            className="border-blue-200 dark:border-blue-700 hover:bg-blue-50 dark:hover:bg-blue-900/20 text-blue-700 dark:text-blue-300 rounded-2xl"
          >
            <Power className="mr-2 h-4 w-4" />
            Reconnect
          </Button>

          <Button
            onClick={handleClearHistory}
            disabled={scanHistory.length === 0}
            variant="outline"
            className="border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-900/20 text-gray-700 dark:text-gray-300 rounded-2xl"
          >
            <RotateCcw className="mr-2 h-4 w-4" />
            Clear History
          </Button>

          <Button
            onClick={() => window.open("/settings", "_blank")}
            variant="outline"
            className="border-orange-200 dark:border-orange-700 hover:bg-orange-50 dark:hover:bg-orange-900/20 text-orange-700 dark:text-orange-300 rounded-2xl"
          >
            <Settings className="mr-2 h-4 w-4" />
            Settings
          </Button>
        </div>

        {/* Scan History */}
        {scanHistory.length > 0 && (
          <div className="space-y-3">
            <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Recent Scans ({scanHistory.length})
            </Label>
            <div className="max-h-48 overflow-y-auto space-y-2">
              {scanHistory.map((scan, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-3 bg-gradient-to-r from-gray-50 to-slate-50 dark:from-gray-900/30 dark:to-slate-900/30 rounded-2xl border border-gray-200 dark:border-gray-700"
                >
                  <div className="flex items-center gap-3">
                    <QrCode className="h-4 w-4 text-gray-500" />
                    <div>
                      <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        {scan.code}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {scan.type} • {scan.timestamp.toLocaleTimeString()}
                      </p>
                    </div>
                  </div>
                  <Badge variant="outline" className="text-xs">
                    {scan.type}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
