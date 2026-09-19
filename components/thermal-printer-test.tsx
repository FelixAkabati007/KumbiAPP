"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { getThermalPrinterService } from "@/lib/thermal-printer";
import { getSettings } from "@/lib/settings";
import {
  testThermalPrinter,
  configureThermalPrinter,
  printReceipt,
} from "@/lib/thermal-printer";
import type {
  ThermalPrinterStatus,
  PrintJob,
  ReceiptData,
} from "@/lib/thermal-printer";
import {
  Printer,
  Power,
  PowerOff,
  AlertCircle,
  Volume2,
  VolumeX,
  Settings,
  TestTube,
  FileText,
  RotateCcw,
  Thermometer,
} from "lucide-react";

export function ThermalPrinterTest() {
  const { toast } = useToast();
  const [status, setStatus] = useState<ThermalPrinterStatus>({
    isConnected: false,
    isPrinting: false,
    lastPrinted: null,
    lastPrintedAt: null,
    error: null,
    paperStatus: "unknown",
    temperature: null,
    printHeadStatus: "unknown",
  });
  const [isLoading, setIsLoading] = useState(false);
  const [settings] = useState(getSettings());
  const [testText, setTestText] = useState("Test print from thermal printer");
  const [printQueue, setPrintQueue] = useState<PrintJob[]>([]);
  const [diagnostics, setDiagnostics] = useState({
    paperStatus: "unknown",
    temperature: 25,
    printHeadStatus: "unknown",
    connectionStatus: "disconnected",
  });

  useEffect(() => {
    // Initialize thermal printer service
    const initializePrinter = async () => {
      if (settings.system.thermalPrinter?.enabled) {
        try {
          const service = getThermalPrinterService(
            settings.system.thermalPrinter,
          );

          // Subscribe to status changes
          const unsubscribeStatus = service.onStatusChange((newStatus) => {
            setStatus(newStatus);
          });

          // Connect to printer
          await service.connect();

          // Get initial diagnostics
          const diag = await service.getDiagnostics();
          setDiagnostics(diag);

          return () => {
            unsubscribeStatus();
          };
        } catch (error) {
          console.error("Failed to initialize thermal printer:", error);
          setStatus((prev) => ({
            ...prev,
            error: "Failed to initialize thermal printer",
          }));
        }
      }
    };

    const cleanup = initializePrinter();

    // Cleanup on unmount
    return () => {
      if (cleanup) {
        cleanup.then((cleanupFn) => cleanupFn && cleanupFn());
      }
    };
  }, [settings.system.thermalPrinter]);

  const handleTestConnection = async () => {
    if (!settings.system.thermalPrinter?.enabled) {
      toast({
        title: "Thermal Printer Disabled",
        description: "Please enable thermal printer in settings first",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      const success = await testThermalPrinter(settings.system.thermalPrinter);

      if (success) {
        toast({
          title: "Test Successful",
          description: "Thermal printer is working correctly",
        });
      } else {
        toast({
          title: "Test Failed",
          description: "Please check your thermal printer configuration",
          variant: "destructive",
        });
      }
    } catch {
      toast({
        title: "Test Error",
        description: "Failed to test thermal printer",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfigurePrinter = async () => {
    if (!settings.system.thermalPrinter?.enabled) {
      toast({
        title: "Thermal Printer Disabled",
        description: "Please enable thermal printer in settings first",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      const success = await configureThermalPrinter(
        settings.system.thermalPrinter,
      );

      if (success) {
        toast({
          title: "Configuration Successful",
          description: "Thermal printer has been configured",
        });
      } else {
        toast({
          title: "Configuration Failed",
          description: "Failed to configure thermal printer",
          variant: "destructive",
        });
      }
    } catch {
      toast({
        title: "Configuration Error",
        description: "Failed to configure thermal printer",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handlePrintText = async () => {
    if (!settings.system.thermalPrinter?.enabled) {
      toast({
        title: "Thermal Printer Disabled",
        description: "Please enable thermal printer in settings first",
        variant: "destructive",
      });
      return;
    }

    if (!testText.trim()) {
      toast({
        title: "Invalid Text",
        description: "Please enter text to print",
        variant: "destructive",
      });
      return;
    }

    try {
      const service = getThermalPrinterService(settings.system.thermalPrinter);
      const success = await service.printText(testText);

      if (success) {
        toast({
          title: "Print Successful",
          description: "Text has been sent to printer",
        });
      } else {
        toast({
          title: "Print Failed",
          description: "Failed to print text",
          variant: "destructive",
        });
      }
    } catch {
      toast({
        title: "Print Error",
        description: "Failed to print text",
        variant: "destructive",
      });
    }
  };

  const handlePrintTestReceipt = async () => {
    if (!settings.system.thermalPrinter?.enabled) {
      toast({
        title: "Thermal Printer Disabled",
        description: "Please enable thermal printer in settings first",
        variant: "destructive",
      });
      return;
    }

    try {
      const testReceipt: ReceiptData = {
        orderNumber: "TEST-001",
        date: new Date().toLocaleDateString(),
        time: new Date().toLocaleTimeString(),
        items: [
          {
            name: "Jollof Rice with Chicken",
            quantity: 2,
            price: 25.0,
            total: 50.0,
            barcode: "123456789012",
          },
          {
            name: "Coca Cola",
            quantity: 2,
            price: 5.0,
            total: 10.0,
            barcode: "049000028911",
          },
          {
            name: "Banku with Tilapia",
            quantity: 1,
            price: 30.0,
            total: 30.0,
          },
        ],
        subtotal: 90.0,
        tax: 11.25,
        total: 101.25,
        paymentMethod: "cash",
        customerName: "Test Customer",
        orderType: "dine-in",
        tableNumber: "5",
      };

      const success = await printReceipt(
        testReceipt,
        settings.system.thermalPrinter,
      );

      if (success) {
        toast({
          title: "Receipt Printed",
          description: "Test receipt has been sent to printer",
        });
      } else {
        toast({
          title: "Print Failed",
          description: "Failed to print test receipt",
          variant: "destructive",
        });
      }
    } catch {
      toast({
        title: "Print Error",
        description: "Failed to print test receipt",
        variant: "destructive",
      });
    }
  };

  const handleReconnect = async () => {
    setIsLoading(true);
    try {
      const service = getThermalPrinterService(settings.system.thermalPrinter);
      const success = await service.connect();

      if (success) {
        const diag = await service.getDiagnostics();
        setDiagnostics(diag);
        toast({
          title: "Reconnected",
          description: "Successfully connected to thermal printer",
        });
      } else {
        toast({
          title: "Connection Failed",
          description: "Could not connect to thermal printer",
          variant: "destructive",
        });
      }
    } catch {
      toast({
        title: "Connection Error",
        description: "Failed to reconnect to thermal printer",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearQueue = () => {
    try {
      const service = getThermalPrinterService(settings.system.thermalPrinter);
      service.clearPrintQueue();
      setPrintQueue([]);
      toast({
        title: "Queue Cleared",
        description: "Print queue has been cleared",
      });
    } catch {
      toast({
        title: "Error",
        description: "Failed to clear print queue",
        variant: "destructive",
      });
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "ok":
        return "bg-green-100 text-green-800 border-green-200 dark:bg-green-900/20 dark:text-green-300 dark:border-green-700";
      case "low":
        return "bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/20 dark:text-yellow-300 dark:border-yellow-700";
      case "empty":
        return "bg-red-100 text-red-800 border-red-200 dark:bg-red-900/20 dark:text-red-300 dark:border-red-700";
      default:
        return "bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-900/20 dark:text-gray-300 dark:border-gray-700";
    }
  };

  if (!settings.system.thermalPrinter?.enabled) {
    return (
      <Card className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm border border-orange-200 dark:border-orange-700 rounded-3xl shadow-xl">
        <CardHeader className="rounded-t-3xl bg-gradient-to-r from-orange-500/10 via-amber-500/10 to-yellow-500/10 dark:from-orange-400/10 dark:via-amber-400/10 dark:to-yellow-400/10">
          <CardTitle className="flex items-center gap-2 text-lg text-gray-800 dark:text-gray-200">
            <div className="p-2 bg-gradient-to-br from-orange-500 via-amber-500 to-yellow-500 rounded-full shadow-lg">
              <Printer className="h-5 w-5 text-white" />
            </div>
            Thermal Printer Test
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          <div className="text-center py-8">
            <PowerOff className="h-12 w-12 mx-auto text-gray-400 mb-4" />
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              Thermal printer is currently disabled
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-500">
              Enable it in Settings → System → Thermal Printer Configuration
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
            <Printer className="h-5 w-5 text-white" />
          </div>
          Thermal Printer Test
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
              {status.isPrinting ? (
                <Printer className="h-4 w-4 text-white animate-pulse" />
              ) : (
                <FileText className="h-4 w-4 text-white" />
              )}
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Printer Status
              </p>
              <Badge
                variant={status.isPrinting ? "destructive" : "default"}
                className={`${
                  status.isPrinting
                    ? "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-700"
                    : "bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-900/20 dark:text-gray-300 dark:border-gray-700"
                }`}
              >
                {status.isPrinting ? "Printing" : "Ready"}
              </Badge>
            </div>
          </div>
        </div>

        {/* Diagnostics */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="text-center p-3 bg-gradient-to-r from-gray-50 to-slate-50 dark:from-gray-900/30 dark:to-slate-900/30 rounded-2xl border border-gray-200 dark:border-gray-700">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Paper Status
            </p>
            <Badge
              className={`text-xs ${getStatusColor(diagnostics.paperStatus)}`}
            >
              {diagnostics.paperStatus.toUpperCase()}
            </Badge>
          </div>
          <div className="text-center p-3 bg-gradient-to-r from-gray-50 to-slate-50 dark:from-gray-900/30 dark:to-slate-900/30 rounded-2xl border border-gray-200 dark:border-gray-700">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Temperature
            </p>
            <div className="flex items-center justify-center gap-1">
              <Thermometer className="h-3 w-3 text-gray-500" />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {diagnostics.temperature}°C
              </span>
            </div>
          </div>
          <div className="text-center p-3 bg-gradient-to-r from-gray-50 to-slate-50 dark:from-gray-900/30 dark:to-slate-900/30 rounded-2xl border border-gray-200 dark:border-gray-700">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Print Head
            </p>
            <Badge
              className={`text-xs ${getStatusColor(
                diagnostics.printHeadStatus,
              )}`}
            >
              {diagnostics.printHeadStatus.toUpperCase()}
            </Badge>
          </div>
        </div>

        {/* Last Print Info */}
        {status.lastPrinted && (
          <div className="flex items-center gap-3 p-4 bg-gradient-to-r from-blue-50 via-indigo-50 to-purple-50 dark:from-blue-900/30 dark:via-indigo-900/30 dark:to-purple-900/30 rounded-2xl border border-blue-200 dark:border-blue-700">
            <div className="p-2 bg-gradient-to-br from-blue-500 via-indigo-500 to-purple-500 rounded-full shadow-lg">
              <FileText className="h-4 w-4 text-white" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Last Printed
              </p>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {status.lastPrinted} at{" "}
                {status.lastPrintedAt?.toLocaleTimeString()}
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
              {settings.system.thermalPrinter?.port || "COM3"}
            </p>
          </div>
          <div className="text-center p-3 bg-gradient-to-r from-gray-50 to-slate-50 dark:from-gray-900/30 dark:to-slate-900/30 rounded-2xl border border-gray-200 dark:border-gray-700">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Paper Width
            </p>
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
              {settings.system.thermalPrinter?.paperWidth || 58}mm
            </p>
          </div>
          <div className="text-center p-3 bg-gradient-to-r from-gray-50 to-slate-50 dark:from-gray-900/30 dark:to-slate-900/30 rounded-2xl border border-gray-200 dark:border-gray-700">
            <p className="text-xs text-gray-500 dark:text-gray-400">Sound</p>
            <div className="flex justify-center">
              {settings.system.thermalPrinter?.soundEnabled ? (
                <Volume2 className="h-4 w-4 text-green-600 dark:text-green-400" />
              ) : (
                <VolumeX className="h-4 w-4 text-gray-400" />
              )}
            </div>
          </div>
        </div>

        {/* Print Test */}
        <div className="space-y-3">
          <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Test Print Text
          </Label>
          <div className="flex gap-2">
            <Textarea
              value={testText}
              onChange={(e) => setTestText(e.target.value)}
              placeholder="Enter text to print..."
              className="flex-1 rounded-2xl border-orange-200 dark:border-orange-700 focus:border-orange-500 dark:focus:border-orange-400 bg-white/50 dark:bg-gray-800/50"
              rows={3}
            />
            <Button
              onClick={handlePrintText}
              disabled={isLoading}
              className="rounded-2xl bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600 text-white shadow-lg"
            >
              <Printer className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Test Controls */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                onClick={handleConfigurePrinter}
                disabled={isLoading}
                variant="outline"
                className="flex-1 rounded-2xl border-blue-200 dark:border-blue-700 hover:bg-blue-50 dark:hover:bg-blue-900/20 text-blue-700 dark:text-blue-300"
              >
                <Settings className="mr-2 h-4 w-4" />
                Configure
              </Button>
            </div>
          </div>

          <div className="space-y-3">
            <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Print Tests
            </Label>
            <div className="flex gap-2">
              <Button
                onClick={handlePrintTestReceipt}
                disabled={isLoading}
                variant="outline"
                className="flex-1 rounded-2xl border-green-200 dark:border-green-700 hover:bg-green-50 dark:hover:bg-green-900/20 text-green-700 dark:text-green-300"
              >
                <FileText className="mr-2 h-4 w-4" />
                Test Receipt
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
            onClick={handleClearQueue}
            disabled={printQueue.length === 0}
            variant="outline"
            className="border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-900/20 text-gray-700 dark:text-gray-300 rounded-2xl"
          >
            <RotateCcw className="mr-2 h-4 w-4" />
            Clear Queue
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
      </CardContent>
    </Card>
  );
}
