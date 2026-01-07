"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Activity,
  AlertTriangle,
  CheckCircle,
  Database,
  DollarSign,
  FileText,
  HardDrive,
  Monitor,
  Printer,
  RefreshCw,
  Scan,
  Settings,
  Shield,
  XCircle,
  Zap,
} from "lucide-react";
import {
  getSystemStatus,
  subscribeToSystemStatus,
  subscribeToSystemEvents,
  initializeIntegrationService,
  type SystemStatus,
  type IntegrationEvent,
} from "@/lib/integration-service";
import { getSettings } from "@/lib/settings";
import { useToast } from "@/hooks/use-toast";

interface SystemDashboardProps {
  className?: string;
}

export function SystemDashboard({ className }: SystemDashboardProps) {
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);
  const [events, setEvents] = useState<IntegrationEvent[]>([]);
  const [isInitializing, setIsInitializing] = useState(false);
  const [showEventLog, setShowEventLog] = useState(false);
  const [settings] = useState(getSettings());
  const { toast } = useToast();

  useEffect(() => {
    // Initialize integration service
    const initService = async () => {
      setIsInitializing(true);
      try {
        const success = await initializeIntegrationService();
        if (success) {
          toast({
            title: "System Initialized",
            description: "All hardware services are ready",
          });
        } else {
          toast({
            title: "Initialization Failed",
            description: "Some hardware services failed to initialize",
            variant: "destructive",
          });
        }
      } catch (error) {
        console.error("Failed to initialize:", error);
        const msg =
          error instanceof Error
            ? error.message
            : "Failed to initialize system";
        toast({
          title: "Initialization Error",
          description: msg,
          variant: "destructive",
        });
      } finally {
        setIsInitializing(false);
      }
    };

    initService();

    // Subscribe to status changes
    const unsubscribeStatus = subscribeToSystemStatus((status) => {
      setSystemStatus(status);
    });

    // Subscribe to events
    const unsubscribeEvents = subscribeToSystemEvents((event) => {
      setEvents((prev) => [event, ...prev.slice(0, 99)]); // Keep last 100 events
    });

    // Get initial status
    setSystemStatus(getSystemStatus());

    return () => {
      unsubscribeStatus();
      unsubscribeEvents();
    };
  }, [toast]);

  const getStatusIcon = (isConnected: boolean, error: string | null) => {
    if (error) return <XCircle className="h-4 w-4 text-red-500" />;
    if (isConnected) return <CheckCircle className="h-4 w-4 text-green-500" />;
    return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
  };

  const getStatusBadge = (isConnected: boolean, error: string | null) => {
    if (error) return <Badge variant="destructive">Error</Badge>;
    if (isConnected) return <Badge variant="default">Connected</Badge>;
    return <Badge variant="secondary">Disconnected</Badge>;
  };

  const getEventIcon = (event: IntegrationEvent) => {
    switch (event.type) {
      case "hardware_connected":
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case "hardware_disconnected":
        return <XCircle className="h-4 w-4 text-red-500" />;
      case "payment_processed":
        return <DollarSign className="h-4 w-4 text-blue-500" />;
      case "barcode_scanned":
        return <Scan className="h-4 w-4 text-purple-500" />;
      case "receipt_printed":
        return <Printer className="h-4 w-4 text-orange-500" />;
      case "refund_requested":
        return <FileText className="h-4 w-4 text-indigo-500" />;
      case "error":
        return <AlertTriangle className="h-4 w-4 text-red-500" />;
      default:
        return <Activity className="h-4 w-4 text-gray-500" />;
    }
  };

  const getEventSourceIcon = (source: string) => {
    switch (source) {
      case "cash_drawer":
        return <DollarSign className="h-3 w-3" />;
      case "barcode_scanner":
        return <Scan className="h-3 w-3" />;
      case "thermal_printer":
        return <Printer className="h-3 w-3" />;
      case "refund_service":
        return <FileText className="h-3 w-3" />;
      case "system":
        return <Settings className="h-3 w-3" />;
      default:
        return <Activity className="h-3 w-3" />;
    }
  };

  if (!systemStatus) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Monitor className="h-5 w-5" />
            System Dashboard
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
            <span className="ml-2 text-muted-foreground">
              {isInitializing ? "Initializing system..." : "Loading status..."}
            </span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className={className}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Monitor className="h-5 w-5" />
              System Dashboard
            </CardTitle>
            <div className="flex items-center gap-2">
              <Badge
                variant={
                  systemStatus.overall.isHealthy ? "default" : "destructive"
                }
                className="flex items-center gap-1"
              >
                {systemStatus.overall.isHealthy ? (
                  <CheckCircle className="h-3 w-3" />
                ) : (
                  <AlertTriangle className="h-3 w-3" />
                )}
                {systemStatus.overall.isHealthy ? "Healthy" : "Issues Detected"}
              </Badge>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowEventLog(true)}
              >
                Event Log ({events.length})
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Hardware Status */}
          <div>
            <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <HardDrive className="h-4 w-4" />
              Hardware Status
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Cash Drawer */}
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <DollarSign className="h-4 w-4" />
                      Cash Drawer
                    </CardTitle>
                    {getStatusIcon(
                      systemStatus.cashDrawer.isConnected,
                      systemStatus.cashDrawer.error,
                    )}
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">
                        Status:
                      </span>
                      {getStatusBadge(
                        systemStatus.cashDrawer.isConnected,
                        systemStatus.cashDrawer.error,
                      )}
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">
                        Drawer:
                      </span>
                      <Badge
                        variant={
                          systemStatus.cashDrawer.isOpen
                            ? "default"
                            : "secondary"
                        }
                      >
                        {systemStatus.cashDrawer.isOpen ? "Open" : "Closed"}
                      </Badge>
                    </div>
                    {systemStatus.cashDrawer.error && (
                      <p className="text-xs text-red-500 mt-2">
                        {systemStatus.cashDrawer.error}
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Barcode Scanner */}
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Scan className="h-4 w-4" />
                      Barcode Scanner
                    </CardTitle>
                    {getStatusIcon(
                      systemStatus.barcodeScanner.isConnected,
                      systemStatus.barcodeScanner.error,
                    )}
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">
                        Status:
                      </span>
                      {getStatusBadge(
                        systemStatus.barcodeScanner.isConnected,
                        systemStatus.barcodeScanner.error,
                      )}
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">
                        Scanning:
                      </span>
                      <Badge
                        variant={
                          systemStatus.barcodeScanner.isScanning
                            ? "default"
                            : "secondary"
                        }
                      >
                        {systemStatus.barcodeScanner.isScanning
                          ? "Active"
                          : "Idle"}
                      </Badge>
                    </div>
                    {systemStatus.barcodeScanner.error && (
                      <p className="text-xs text-red-500 mt-2">
                        {systemStatus.barcodeScanner.error}
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Thermal Printer */}
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Printer className="h-4 w-4" />
                      Thermal Printer
                    </CardTitle>
                    {getStatusIcon(
                      systemStatus.thermalPrinter.isConnected,
                      systemStatus.thermalPrinter.error,
                    )}
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">
                        Status:
                      </span>
                      {getStatusBadge(
                        systemStatus.thermalPrinter.isConnected,
                        systemStatus.thermalPrinter.error,
                      )}
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">
                        Paper:
                      </span>
                      <Badge
                        variant={
                          systemStatus.thermalPrinter.paperStatus === "ok"
                            ? "default"
                            : systemStatus.thermalPrinter.paperStatus === "low"
                              ? "secondary"
                              : "destructive"
                        }
                      >
                        {systemStatus.thermalPrinter.paperStatus.toUpperCase()}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">
                        Printing:
                      </span>
                      <Badge
                        variant={
                          systemStatus.thermalPrinter.isPrinting
                            ? "default"
                            : "secondary"
                        }
                      >
                        {systemStatus.thermalPrinter.isPrinting
                          ? "Active"
                          : "Idle"}
                      </Badge>
                    </div>
                    {systemStatus.thermalPrinter.error && (
                      <p className="text-xs text-red-500 mt-2">
                        {systemStatus.thermalPrinter.error}
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          <Separator />

          {/* System Information */}
          <div>
            <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <Settings className="h-4 w-4" />
              System Information
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card>
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2">
                    <Database className="h-4 w-4 text-blue-500" />
                    <div>
                      <p className="text-sm font-medium">Restaurant</p>
                      <p className="text-xs text-muted-foreground">
                        {settings.account.restaurantName}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2">
                    <Shield className="h-4 w-4 text-green-500" />
                    <div>
                      <p className="text-sm font-medium">Security</p>
                      <p className="text-xs text-muted-foreground">
                        {settings.security.requireLogin
                          ? "Login Required"
                          : "No Login"}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2">
                    <Zap className="h-4 w-4 text-yellow-500" />
                    <div>
                      <p className="text-sm font-medium">Tax Rate</p>
                      <p className="text-xs text-muted-foreground">
                        {settings.system.taxRate}%
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-purple-500" />
                    <div>
                      <p className="text-sm font-medium">Refunds</p>
                      <p className="text-xs text-muted-foreground">
                        {systemStatus.refunds.pendingRequests} pending
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          <Separator />

          {/* Recent Events */}
          <div>
            <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Recent Events
            </h3>
            <ScrollArea className="h-32">
              <div className="space-y-2">
                {events.slice(0, 5).map((event, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-3 p-2 rounded-lg border bg-card"
                  >
                    {getEventIcon(event)}
                    <div className="flex items-center gap-2">
                      {getEventSourceIcon(event.source)}
                      <span className="text-sm font-medium capitalize">
                        {event.source.replace("_", " ")}
                      </span>
                    </div>
                    <span className="text-sm text-muted-foreground flex-1">
                      {event.type.replace("_", " ")}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {event.timestamp.toLocaleTimeString()}
                    </span>
                  </div>
                ))}
                {events.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No recent events
                  </p>
                )}
              </div>
            </ScrollArea>
          </div>

          {/* System Errors */}
          {systemStatus.overall.errors.length > 0 && (
            <>
              <Separator />
              <div>
                <h3 className="text-lg font-semibold mb-3 flex items-center gap-2 text-red-600">
                  <AlertTriangle className="h-4 w-4" />
                  System Errors
                </h3>
                <div className="space-y-2">
                  {systemStatus.overall.errors.map((error, index) => (
                    <div
                      key={index}
                      className="flex items-center gap-2 p-2 rounded-lg border border-red-200 bg-red-50"
                    >
                      <XCircle className="h-4 w-4 text-red-500" />
                      <span className="text-sm text-red-700">{error}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Event Log Dialog */}
      <Dialog open={showEventLog} onOpenChange={setShowEventLog}>
        <DialogContent className="max-w-4xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              System Event Log
            </DialogTitle>
            <DialogDescription>
              Real-time events from all system components
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="h-96">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Event</TableHead>
                  <TableHead>Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.map((event, index) => (
                  <TableRow key={index}>
                    <TableCell className="font-mono text-xs">
                      {event.timestamp.toLocaleTimeString()}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {getEventSourceIcon(event.source)}
                        <span className="capitalize">
                          {event.source.replace("_", " ")}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {getEventIcon(event)}
                        <span className="capitalize">
                          {event.type.replace("_", " ")}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-muted-foreground">
                        {JSON.stringify(event.data)}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
                {events.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={4}
                      className="text-center text-muted-foreground"
                    >
                      No events recorded
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </>
  );
}
