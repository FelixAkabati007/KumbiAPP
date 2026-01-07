"use client";

import React from "react";
import { PrinterConfig } from "@/lib/settings";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Printer, Wifi, Cable, Usb, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

interface PrinterSettingsFormProps {
  config: PrinterConfig;
  onChange: (newConfig: PrinterConfig) => void;
  title: string;
  description: string;
  disabled?: boolean;
}

export function PrinterSettingsForm({
  config,
  onChange,
  title,
  description,
  disabled = false,
}: PrinterSettingsFormProps) {
  const { toast } = useToast();
  const handleChange = (
    field: keyof PrinterConfig,
    value: string | number | boolean,
  ) => {
    onChange({
      ...config,
      [field]: value,
    });
  };

  const handleTestPrinter = async () => {
    try {
      // We need to override the service's internal config usage for printReceipt
      // because printReceipt fetches settings from localStorage (getSettings).
      // However, the test() method calls printReceipt.
      //
      // ISSUE: ThermalPrinterService.printReceipt gets configs from getSettings(),
      // NOT from the instance config passed to constructor (mostly).
      // Actually, looking at printReceipt implementation:
      // const settings = getSettings();
      // const configs: PrinterConfig[] = [settings.system.thermalPrinter];
      // ...
      // body: JSON.stringify({ receipt: data, configs })
      //
      // So it ignores the 'config' passed to constructor for the API call payload!
      // This means we can't easily test *unsaved* settings using the current ThermalPrinterService.printReceipt.
      //
      // FIX: I should probably modify ThermalPrinterService.printReceipt to accept optional configs override,
      // OR I can just call the API directly here for testing.

      // Let's call API directly here for testing to ensure we test the CURRENT form values.
      const testReceipt = {
        orderNumber: "TEST-001",
        date: new Date().toLocaleDateString(),
        time: new Date().toLocaleTimeString(),
        items: [{ name: "Test Item 1", quantity: 1, price: 10.0, total: 10.0 }],
        subtotal: 10.0,
        tax: 0.0,
        total: 10.0,
        paymentMethod: "Test",
      };

      const response = await fetch("/api/print", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ receipt: testReceipt, configs: [config] }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.message || "Print failed");
      }

      toast({
        title: "Test Print Successful",
        description: `Sent test receipt to ${config.name || "Printer"}`,
      });
    } catch (error) {
      toast({
        title: "Test Print Failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    }
  };

  return (
    <Card className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm border border-orange-200 dark:border-orange-700 rounded-3xl shadow-xl relative overflow-hidden mb-6">
      <div className="absolute inset-0 bg-gradient-to-br from-orange-100/20 via-amber-100/20 to-yellow-100/20 dark:from-orange-900/20 dark:via-amber-900/20 dark:to-yellow-900/20"></div>
      <CardHeader className="rounded-t-3xl bg-gradient-to-r from-orange-500/10 via-amber-500/10 to-yellow-500/10 dark:from-orange-400/10 dark:via-amber-400/10 dark:to-yellow-400/10 relative z-10">
        <CardTitle className="flex items-center gap-2 text-lg sm:text-xl text-gray-800 dark:text-gray-200">
          <div className="p-2 bg-gradient-to-br from-orange-500 via-amber-500 to-yellow-500 rounded-full shadow-lg">
            <Printer className="h-5 w-5 text-white" />
          </div>
          {title}
        </CardTitle>
        <CardDescription className="text-sm text-gray-600 dark:text-gray-400">
          {description}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6 p-6 relative z-10">
        {/* Enable Switch */}
        <div className="flex items-center justify-between gap-4 p-4 bg-gradient-to-r from-orange-50 via-amber-50 to-yellow-50 dark:from-orange-900/30 dark:via-amber-900/30 dark:to-yellow-900/30 rounded-2xl border border-orange-200 dark:border-orange-700 shadow-sm">
          <div className="min-w-0 flex-1">
            <Label className="text-sm sm:text-base text-gray-700 dark:text-gray-300">
              Enable Printer
            </Label>
            <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
              Turn on to use this printer
            </p>
          </div>
          <Switch
            checked={config.enabled}
            onCheckedChange={(checked) => handleChange("enabled", checked)}
            className="data-[state=checked]:bg-gradient-to-r data-[state=checked]:from-orange-500 data-[state=checked]:via-amber-500 data-[state=checked]:to-yellow-500"
            disabled={disabled}
          />
        </div>

        {config.enabled && (
          <div className="space-y-6">
            {/* Basic Info */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label className="text-sm sm:text-base text-gray-700 dark:text-gray-300">
                  Printer Name
                </Label>
                <Input
                  value={config.name || ""}
                  onChange={(e) => handleChange("name", e.target.value)}
                  placeholder="e.g. Kitchen Printer"
                  className="rounded-2xl border-orange-200 dark:border-orange-700 focus:border-orange-500 dark:focus:border-orange-400 bg-white/50 dark:bg-gray-800/50"
                  disabled={disabled}
                />
              </div>
              <div className="grid gap-2">
                <Label className="text-sm sm:text-base text-gray-700 dark:text-gray-300">
                  Interface Type
                </Label>
                <Select
                  value={config.interfaceType || "tcp"}
                  onValueChange={(value) =>
                    handleChange("interfaceType", value)
                  }
                  disabled={disabled}
                >
                  <SelectTrigger className="w-full rounded-2xl border-orange-200 dark:border-orange-700 focus:border-orange-500 dark:focus:border-orange-400 bg-white/50 dark:bg-gray-800/50">
                    <SelectValue placeholder="Select Interface" />
                  </SelectTrigger>
                  <SelectContent className="rounded-2xl border-orange-200 dark:border-orange-700">
                    <SelectItem value="tcp">
                      <div className="flex items-center gap-2">
                        <Wifi className="h-4 w-4" /> Network (TCP/IP)
                      </div>
                    </SelectItem>
                    <SelectItem value="serial">
                      <div className="flex items-center gap-2">
                        <Cable className="h-4 w-4" /> Serial (COM)
                      </div>
                    </SelectItem>
                    <SelectItem value="usb">
                      <div className="flex items-center gap-2">
                        <Usb className="h-4 w-4" /> USB
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Connection Details */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {config.interfaceType === "tcp" && (
                <div className="grid gap-2">
                  <Label className="text-sm sm:text-base text-gray-700 dark:text-gray-300">
                    IP Address
                  </Label>
                  <Input
                    value={config.ip || ""}
                    onChange={(e) => handleChange("ip", e.target.value)}
                    placeholder="192.168.1.200"
                    className="rounded-2xl border-orange-200 dark:border-orange-700 focus:border-orange-500 dark:focus:border-orange-400 bg-white/50 dark:bg-gray-800/50"
                    disabled={disabled}
                  />
                </div>
              )}

              <div className="grid gap-2">
                <Label className="text-sm sm:text-base text-gray-700 dark:text-gray-300">
                  {config.interfaceType === "tcp"
                    ? "Port (Default: 9100)"
                    : "Port / Path"}
                </Label>
                <Input
                  value={config.port || ""}
                  onChange={(e) => handleChange("port", e.target.value)}
                  placeholder={config.interfaceType === "tcp" ? "9100" : "COM3"}
                  className="rounded-2xl border-orange-200 dark:border-orange-700 focus:border-orange-500 dark:focus:border-orange-400 bg-white/50 dark:bg-gray-800/50"
                  disabled={disabled}
                />
              </div>

              {config.interfaceType === "serial" && (
                <div className="grid gap-2">
                  <Label className="text-sm sm:text-base text-gray-700 dark:text-gray-300">
                    Baud Rate
                  </Label>
                  <Select
                    value={String(config.baudRate || 9600)}
                    onValueChange={(value) =>
                      handleChange("baudRate", Number.parseInt(value))
                    }
                    disabled={disabled}
                  >
                    <SelectTrigger className="w-full rounded-2xl border-orange-200 dark:border-orange-700 focus:border-orange-500 dark:focus:border-orange-400 bg-white/50 dark:bg-gray-800/50">
                      <SelectValue placeholder="Select baud rate" />
                    </SelectTrigger>
                    <SelectContent className="rounded-2xl border-orange-200 dark:border-orange-700">
                      <SelectItem value="9600">9600</SelectItem>
                      <SelectItem value="19200">19200</SelectItem>
                      <SelectItem value="38400">38400</SelectItem>
                      <SelectItem value="57600">57600</SelectItem>
                      <SelectItem value="115200">115200</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            {/* Print Settings */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label className="text-sm sm:text-base text-gray-700 dark:text-gray-300">
                  Paper Width
                </Label>
                <Select
                  value={String(config.paperWidth || 58)}
                  onValueChange={(value) =>
                    handleChange("paperWidth", Number.parseInt(value))
                  }
                  disabled={disabled}
                >
                  <SelectTrigger className="w-full rounded-2xl border-orange-200 dark:border-orange-700 focus:border-orange-500 dark:focus:border-orange-400 bg-white/50 dark:bg-gray-800/50">
                    <SelectValue placeholder="Select width" />
                  </SelectTrigger>
                  <SelectContent className="rounded-2xl border-orange-200 dark:border-orange-700">
                    <SelectItem value="58">58mm</SelectItem>
                    <SelectItem value="80">80mm</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label className="text-sm sm:text-base text-gray-700 dark:text-gray-300">
                  Print Density
                </Label>
                <Select
                  value={String(config.printDensity || 8)}
                  onValueChange={(value) =>
                    handleChange("printDensity", Number.parseInt(value))
                  }
                  disabled={disabled}
                >
                  <SelectTrigger className="w-full rounded-2xl border-orange-200 dark:border-orange-700 focus:border-orange-500 dark:focus:border-orange-400 bg-white/50 dark:bg-gray-800/50">
                    <SelectValue placeholder="Select density" />
                  </SelectTrigger>
                  <SelectContent className="rounded-2xl border-orange-200 dark:border-orange-700">
                    <SelectItem value="0">0 (Light)</SelectItem>
                    <SelectItem value="4">4 (Normal)</SelectItem>
                    <SelectItem value="8">8 (Dark)</SelectItem>
                    <SelectItem value="15">15 (Max)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Toggles */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex items-center justify-between gap-4 p-3 bg-white/30 dark:bg-black/20 rounded-xl border border-orange-100 dark:border-orange-800">
                <Label className="text-sm text-gray-700 dark:text-gray-300">
                  Auto Cut
                </Label>
                <Switch
                  checked={config.autoCut}
                  onCheckedChange={(checked) =>
                    handleChange("autoCut", checked)
                  }
                  disabled={disabled}
                />
              </div>
              <div className="flex items-center justify-between gap-4 p-3 bg-white/30 dark:bg-black/20 rounded-xl border border-orange-100 dark:border-orange-800">
                <Label className="text-sm text-gray-700 dark:text-gray-300">
                  Sound Enabled
                </Label>
                <Switch
                  checked={config.soundEnabled}
                  onCheckedChange={(checked) =>
                    handleChange("soundEnabled", checked)
                  }
                  disabled={disabled}
                />
              </div>
              <div className="flex items-center justify-between gap-4 p-3 bg-white/30 dark:bg-black/20 rounded-xl border border-orange-100 dark:border-orange-800">
                <Label className="text-sm text-gray-700 dark:text-gray-300">
                  Include Logo
                </Label>
                <Switch
                  checked={config.includeLogo}
                  onCheckedChange={(checked) =>
                    handleChange("includeLogo", checked)
                  }
                  disabled={disabled}
                />
              </div>
              <div className="flex items-center justify-between gap-4 p-3 bg-white/30 dark:bg-black/20 rounded-xl border border-orange-100 dark:border-orange-800">
                <Label className="text-sm text-gray-700 dark:text-gray-300">
                  Include Footer
                </Label>
                <Switch
                  checked={config.includeFooter}
                  onCheckedChange={(checked) =>
                    handleChange("includeFooter", checked)
                  }
                  disabled={disabled}
                />
              </div>
            </div>

            {config.includeFooter && (
              <div className="grid gap-2">
                <Label className="text-sm sm:text-base text-gray-700 dark:text-gray-300">
                  Footer Text
                </Label>
                <Input
                  value={config.footerText || ""}
                  onChange={(e) => handleChange("footerText", e.target.value)}
                  placeholder="Thank you for dining with us!"
                  className="rounded-2xl border-orange-200 dark:border-orange-700 focus:border-orange-500 dark:focus:border-orange-400 bg-white/50 dark:bg-gray-800/50"
                  disabled={disabled}
                />
              </div>
            )}

            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={handleTestPrinter}
                className="bg-white/50 dark:bg-gray-800/50 border-orange-200 dark:border-orange-700 hover:bg-orange-50 dark:hover:bg-orange-900/20 text-orange-700 dark:text-orange-300 rounded-2xl"
                disabled={disabled}
              >
                <Play className="mr-2 h-4 w-4" />
                Test Connection
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
