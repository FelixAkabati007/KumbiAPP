"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ArrowLeft,
  Activity,
  Settings,
  Monitor,
  HardDrive,
  Database,
  Shield,
  RefreshCw,
} from "lucide-react";
import { SystemDashboard } from "@/components/system-dashboard";
import { useIntegration } from "@/components/integration-provider";
import { useToast } from "@/hooks/use-toast";
import { LogoDisplay } from "@/components/logo-display";
import { RoleGuard } from "@/components/role-guard";

function SystemContent() {
  const { isInitialized, systemStatus, initialize, refreshStatus } =
    useIntegration();
  const { toast } = useToast();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await initialize();
      refreshStatus();
      toast({
        title: "System Refreshed",
        description: "System status has been updated",
      });
    } catch {
      toast({
        title: "Refresh Failed",
        description: "Failed to refresh system status",
        variant: "destructive",
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <div className="flex min-h-screen w-full flex-col bg-gradient-to-br from-orange-50 via-amber-50 to-yellow-100 dark:from-orange-950 dark:via-amber-950 dark:to-yellow-950">
      <header className="sticky top-0 z-10 flex h-16 items-center gap-4 border-b bg-white/80 dark:bg-gray-900/80 backdrop-blur-md px-4 md:px-6 border-orange-200 dark:border-orange-700">
        <Link
          href="/"
          className="flex items-center gap-2 hover:opacity-80 transition-opacity"
        >
          <ArrowLeft className="h-5 w-5 text-orange-600 dark:text-orange-400" />
          <LogoDisplay size="sm" />
          <Monitor className="h-6 w-6 text-orange-600 dark:text-orange-400" />
          <h1 className="text-lg font-semibold text-gray-800 dark:text-gray-200">
            System Monitoring
          </h1>
        </Link>
        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="border-orange-200 dark:border-orange-700 hover:bg-orange-50 dark:hover:bg-orange-900/20 text-orange-700 dark:text-orange-300"
          >
            <RefreshCw
              className={`h-4 w-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
          <Link href="/settings">
            <Button
              variant="outline"
              size="sm"
              className="border-orange-200 dark:border-orange-700 hover:bg-orange-50 dark:hover:bg-orange-900/20 text-orange-700 dark:text-orange-300"
            >
              <Settings className="h-4 w-4 mr-2" />
              Settings
            </Button>
          </Link>
        </div>
      </header>

      <main className="flex-1 p-4 md:p-6">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* System Status Overview */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="border-orange-200 dark:border-orange-700 bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm">
              <CardContent className="pt-4">
                <div className="flex items-center gap-2">
                  <Activity className="h-4 w-4 text-blue-500" />
                  <div>
                    <p className="text-sm font-medium">System Status</p>
                    <p className="text-xs text-muted-foreground">
                      {isInitialized ? "Initialized" : "Initializing..."}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-orange-200 dark:border-orange-700 bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm">
              <CardContent className="pt-4">
                <div className="flex items-center gap-2">
                  <HardDrive className="h-4 w-4 text-green-500" />
                  <div>
                    <p className="text-sm font-medium">Hardware Health</p>
                    <p className="text-xs text-muted-foreground">
                      {systemStatus?.overall.isHealthy
                        ? "Healthy"
                        : "Issues Detected"}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-orange-200 dark:border-orange-700 bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm">
              <CardContent className="pt-4">
                <div className="flex items-center gap-2">
                  <Database className="h-4 w-4 text-purple-500" />
                  <div>
                    <p className="text-sm font-medium">Services</p>
                    <p className="text-xs text-muted-foreground">
                      {systemStatus
                        ? `${
                            Object.values(systemStatus).filter(
                              (s) =>
                                typeof s === "object" &&
                                "isConnected" in s &&
                                s.isConnected
                            ).length
                          } Connected`
                        : "Loading..."}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-orange-200 dark:border-orange-700 bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm">
              <CardContent className="pt-4">
                <div className="flex items-center gap-2">
                  <Shield className="h-4 w-4 text-orange-500" />
                  <div>
                    <p className="text-sm font-medium">Security</p>
                    <p className="text-xs text-muted-foreground">
                      {systemStatus?.overall.errors.length || 0} Issues
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Main Dashboard */}
          <Tabs defaultValue="overview" className="w-full">
            <TabsList className="grid w-full grid-cols-3 bg-white/70 dark:bg-gray-800/70 border border-orange-200 dark:border-orange-700 rounded-full p-1 shadow-lg">
              <TabsTrigger
                value="overview"
                className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-orange-500 data-[state=active]:via-amber-500 data-[state=active]:to-yellow-500 data-[state=active]:text-white data-[state=active]:shadow-lg"
              >
                <Monitor className="h-4 w-4 mr-2" />
                Overview
              </TabsTrigger>
              <TabsTrigger
                value="hardware"
                className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-orange-500 data-[state=active]:via-amber-500 data-[state=active]:to-yellow-500 data-[state=active]:text-white data-[state=active]:shadow-lg"
              >
                <HardDrive className="h-4 w-4 mr-2" />
                Hardware
              </TabsTrigger>
              <TabsTrigger
                value="events"
                className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-orange-500 data-[state=active]:via-amber-500 data-[state=active]:to-yellow-500 data-[state=active]:text-white data-[state=active]:shadow-lg"
              >
                <Activity className="h-4 w-4 mr-2" />
                Events
              </TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="mt-6">
              <SystemDashboard />
            </TabsContent>

            <TabsContent value="hardware" className="mt-6">
              <Card className="border-blue-200 dark:border-blue-700 bg-white/50 dark:bg-gray-800/50">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <HardDrive className="h-5 w-5" />
                    Hardware Status
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {/* Cash Drawer Status */}
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm">Cash Drawer</CardTitle>
                      </CardHeader>
                      <CardContent className="pt-0">
                        <div className="space-y-2">
                          <div className="flex justify-between">
                            <span className="text-sm text-muted-foreground">
                              Status:
                            </span>
                            <span
                              className={`text-sm font-medium ${
                                systemStatus?.cashDrawer.isConnected
                                  ? "text-green-600"
                                  : "text-red-600"
                              }`}
                            >
                              {systemStatus?.cashDrawer.isConnected
                                ? "Connected"
                                : "Disconnected"}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-sm text-muted-foreground">
                              Drawer:
                            </span>
                            <span
                              className={`text-sm font-medium ${
                                systemStatus?.cashDrawer.isOpen
                                  ? "text-blue-600"
                                  : "text-gray-600"
                              }`}
                            >
                              {systemStatus?.cashDrawer.isOpen
                                ? "Open"
                                : "Closed"}
                            </span>
                          </div>
                          {systemStatus?.cashDrawer.error && (
                            <p className="text-xs text-red-500">
                              {systemStatus.cashDrawer.error}
                            </p>
                          )}
                        </div>
                      </CardContent>
                    </Card>

                    {/* Barcode Scanner Status */}
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm">
                          Barcode Scanner
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="pt-0">
                        <div className="space-y-2">
                          <div className="flex justify-between">
                            <span className="text-sm text-muted-foreground">
                              Status:
                            </span>
                            <span
                              className={`text-sm font-medium ${
                                systemStatus?.barcodeScanner.isConnected
                                  ? "text-green-600"
                                  : "text-red-600"
                              }`}
                            >
                              {systemStatus?.barcodeScanner.isConnected
                                ? "Connected"
                                : "Disconnected"}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-sm text-muted-foreground">
                              Scanning:
                            </span>
                            <span
                              className={`text-sm font-medium ${
                                systemStatus?.barcodeScanner.isScanning
                                  ? "text-blue-600"
                                  : "text-gray-600"
                              }`}
                            >
                              {systemStatus?.barcodeScanner.isScanning
                                ? "Active"
                                : "Idle"}
                            </span>
                          </div>
                          {systemStatus?.barcodeScanner.error && (
                            <p className="text-xs text-red-500">
                              {systemStatus.barcodeScanner.error}
                            </p>
                          )}
                        </div>
                      </CardContent>
                    </Card>

                    {/* Thermal Printer Status */}
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm">
                          Thermal Printer
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="pt-0">
                        <div className="space-y-2">
                          <div className="flex justify-between">
                            <span className="text-sm text-muted-foreground">
                              Status:
                            </span>
                            <span
                              className={`text-sm font-medium ${
                                systemStatus?.thermalPrinter.isConnected
                                  ? "text-green-600"
                                  : "text-red-600"
                              }`}
                            >
                              {systemStatus?.thermalPrinter.isConnected
                                ? "Connected"
                                : "Disconnected"}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-sm text-muted-foreground">
                              Paper:
                            </span>
                            <span
                              className={`text-sm font-medium ${
                                systemStatus?.thermalPrinter.paperStatus ===
                                "ok"
                                  ? "text-green-600"
                                  : systemStatus?.thermalPrinter.paperStatus ===
                                      "low"
                                    ? "text-yellow-600"
                                    : "text-red-600"
                              }`}
                            >
                              {systemStatus?.thermalPrinter.paperStatus?.toUpperCase() ||
                                "Unknown"}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-sm text-muted-foreground">
                              Printing:
                            </span>
                            <span
                              className={`text-sm font-medium ${
                                systemStatus?.thermalPrinter.isPrinting
                                  ? "text-blue-600"
                                  : "text-gray-600"
                              }`}
                            >
                              {systemStatus?.thermalPrinter.isPrinting
                                ? "Active"
                                : "Idle"}
                            </span>
                          </div>
                          {systemStatus?.thermalPrinter.error && (
                            <p className="text-xs text-red-500">
                              {systemStatus.thermalPrinter.error}
                            </p>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="events" className="mt-6">
              <Card className="border-blue-200 dark:border-blue-700 bg-white/50 dark:bg-gray-800/50">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Activity className="h-5 w-5" />
                    System Events
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    View detailed system events and logs in the main dashboard
                    overview.
                  </p>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  );
}

export default function SystemPage() {
  return (
    <RoleGuard section="system">
      <SystemContent />
    </RoleGuard>
  );
}
