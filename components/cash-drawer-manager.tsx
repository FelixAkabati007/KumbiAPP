"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
// Removed unused Separator import
import { useToast } from "@/hooks/use-toast";
import { useSettings } from "@/components/settings-provider";
import {
  getCashDrawerService,
  testCashDrawer,
  type CashDrawerStatus,
} from "@/lib/cash-drawer";
import {
  Utensils,
  Power,
  PowerOff,
  AlertCircle,
  CheckCircle,
  Clock,
  Volume2,
  VolumeX,
} from "lucide-react";

export function CashDrawerManager() {
  const { toast } = useToast();
  const [status, setStatus] = useState<CashDrawerStatus>({
    isConnected: false,
    isOpen: false,
    lastOpened: null,
    error: null,
  });
  const [isLoading, setIsLoading] = useState(false);
  const { settings } = useSettings();

  useEffect(() => {
    // Initialize cash drawer service
    const initializeCashDrawer = async () => {
      if (settings.system.cashDrawer?.enabled) {
        try {
          const service = getCashDrawerService(settings.system.cashDrawer);

          // Subscribe to status changes
          const unsubscribe = service.onStatusChange((newStatus) => {
            setStatus(newStatus);
          });

          // Connect to cash drawer
          await service.connect();

          return unsubscribe;
        } catch (error) {
          console.error("Failed to initialize cash drawer:", error);
          setStatus((prev) => ({
            ...prev,
            error: "Failed to initialize cash drawer",
          }));
        }
      }
    };

    const unsubscribe = initializeCashDrawer();

    // Cleanup on unmount
    return () => {
      if (unsubscribe && typeof unsubscribe.then === "function") {
        unsubscribe.then((unsub) => unsub && unsub());
      }
    };
  }, [settings.system.cashDrawer]);

  const handleOpenDrawer = async () => {
    if (!settings.system.cashDrawer?.enabled) {
      toast({
        title: "Cash Drawer Disabled",
        description: "Please enable cash drawer in settings first",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      const service = getCashDrawerService(settings.system.cashDrawer);
      const success = await service.open();

      if (success) {
        toast({
          title: "Cash Drawer Opened",
          description: "Cash drawer has been opened successfully",
        });
      } else {
        toast({
          title: "Failed to Open",
          description: status.error || "Could not open cash drawer",
          variant: "destructive",
        });
      }
    } catch {
      toast({
        title: "Error",
        description: "Failed to open cash drawer",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleTestConnection = async () => {
    if (!settings.system.cashDrawer?.enabled) {
      toast({
        title: "Cash Drawer Disabled",
        description: "Please enable cash drawer in settings first",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      const success = await testCashDrawer(settings.system.cashDrawer);

      if (success) {
        toast({
          title: "Test Successful",
          description: "Cash drawer is working correctly",
        });
      } else {
        toast({
          title: "Test Failed",
          description: "Please check your cash drawer configuration",
          variant: "destructive",
        });
      }
    } catch {
      toast({
        title: "Test Error",
        description: "Failed to test cash drawer",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleReconnect = async () => {
    setIsLoading(true);
    try {
      const service = getCashDrawerService(settings.system.cashDrawer);
      const success = await service.connect();

      if (success) {
        toast({
          title: "Reconnected",
          description: "Successfully connected to cash drawer",
        });
      } else {
        toast({
          title: "Connection Failed",
          description: "Could not connect to cash drawer",
          variant: "destructive",
        });
      }
    } catch {
      toast({
        title: "Connection Error",
        description: "Failed to reconnect to cash drawer",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (!settings.system.cashDrawer?.enabled) {
    return (
      <Card className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm border border-orange-200 dark:border-orange-700 rounded-3xl shadow-xl">
        <CardHeader className="rounded-t-3xl bg-gradient-to-r from-orange-500/10 via-amber-500/10 to-yellow-500/10 dark:from-orange-400/10 dark:via-amber-400/10 dark:to-yellow-400/10">
          <CardTitle className="flex items-center gap-2 text-lg text-gray-800 dark:text-gray-200">
            <div className="p-2 bg-gradient-to-br from-orange-500 via-amber-500 to-yellow-500 rounded-full shadow-lg">
              <Utensils className="h-5 w-5 text-white" />
            </div>
            Cash Drawer Manager
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          <div className="text-center py-8">
            <PowerOff className="h-12 w-12 mx-auto text-gray-400 mb-4" />
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              Cash drawer is currently disabled
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-500">
              Enable it in Settings → System → Cash Drawer Configuration
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
            <Utensils className="h-5 w-5 text-white" />
          </div>
          Cash Drawer Manager
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
              {status.isOpen ? (
                <AlertCircle className="h-4 w-4 text-white" />
              ) : (
                <CheckCircle className="h-4 w-4 text-white" />
              )}
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Drawer Status
              </p>
              <Badge
                variant={status.isOpen ? "destructive" : "default"}
                className={`${
                  status.isOpen
                    ? "bg-red-100 text-red-800 border-red-200 dark:bg-red-900/20 dark:text-red-300 dark:border-red-700"
                    : "bg-green-100 text-green-800 border-green-200 dark:bg-green-900/20 dark:text-green-300 dark:border-green-700"
                }`}
              >
                {status.isOpen ? "Open" : "Closed"}
              </Badge>
            </div>
          </div>
        </div>

        {/* Last Opened Info */}
        {status.lastOpened && (
          <div className="flex items-center gap-3 p-4 bg-gradient-to-r from-blue-50 via-indigo-50 to-purple-50 dark:from-blue-900/30 dark:via-indigo-900/30 dark:to-purple-900/30 rounded-2xl border border-blue-200 dark:border-blue-700">
            <div className="p-2 bg-gradient-to-br from-blue-500 via-indigo-500 to-purple-500 rounded-full shadow-lg">
              <Clock className="h-4 w-4 text-white" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Last Opened
              </p>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {status.lastOpened.toLocaleString()}
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
              {settings.system.cashDrawer?.port || "COM1"}
            </p>
          </div>
          <div className="text-center p-3 bg-gradient-to-r from-gray-50 to-slate-50 dark:from-gray-900/30 dark:to-slate-900/30 rounded-2xl border border-gray-200 dark:border-gray-700">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Baud Rate
            </p>
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
              {settings.system.cashDrawer?.baudRate || 9600}
            </p>
          </div>
          <div className="text-center p-3 bg-gradient-to-r from-gray-50 to-slate-50 dark:from-gray-900/30 dark:to-slate-900/30 rounded-2xl border border-gray-200 dark:border-gray-700">
            <p className="text-xs text-gray-500 dark:text-gray-400">Sound</p>
            <div className="flex justify-center">
              {settings.system.cashDrawer?.soundEnabled ? (
                <Volume2 className="h-4 w-4 text-green-600 dark:text-green-400" />
              ) : (
                <VolumeX className="h-4 w-4 text-gray-400" />
              )}
            </div>
          </div>
        </div>

        {/* Control Buttons */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Button
            onClick={handleOpenDrawer}
            disabled={isLoading || !status.isConnected || status.isOpen}
            className="bg-gradient-to-r from-orange-500 via-amber-500 to-yellow-500 hover:from-orange-600 hover:via-amber-600 hover:to-yellow-600 text-white shadow-lg rounded-2xl"
          >
            <Utensils className="mr-2 h-4 w-4" />
            Open Drawer
          </Button>

          <Button
            onClick={handleTestConnection}
            disabled={isLoading}
            variant="outline"
            className="border-orange-200 dark:border-orange-700 hover:bg-orange-50 dark:hover:bg-orange-900/20 text-orange-700 dark:text-orange-300 rounded-2xl"
          >
            <CheckCircle className="mr-2 h-4 w-4" />
            Test Connection
          </Button>

          <Button
            onClick={handleReconnect}
            disabled={isLoading}
            variant="outline"
            className="border-blue-200 dark:border-blue-700 hover:bg-blue-50 dark:hover:bg-blue-900/20 text-blue-700 dark:text-blue-300 rounded-2xl"
          >
            <Power className="mr-2 h-4 w-4" />
            Reconnect
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
