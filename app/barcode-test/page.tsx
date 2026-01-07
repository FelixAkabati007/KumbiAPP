"use client";

import { BarcodeScannerTest } from "@/components/barcode-scanner-test";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, QrCode, Settings } from "lucide-react";
import Link from "next/link";

export default function BarcodeTestPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-amber-50 to-yellow-50 dark:from-orange-950 dark:via-amber-950 dark:to-yellow-950">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-4 mb-4">
            <Link href="/">
              <Button
                variant="outline"
                size="sm"
                className="rounded-2xl border-orange-200 dark:border-orange-700 hover:bg-orange-50 dark:hover:bg-orange-900/20 text-orange-700 dark:text-orange-300"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
            </Link>
            <div className="flex-1">
              <h1 className="text-3xl font-bold text-gray-800 dark:text-gray-200">
                Barcode Scanner Test
              </h1>
              <p className="text-gray-600 dark:text-gray-400">
                Test and configure your barcode scanner hardware
              </p>
            </div>
            <Link href="/settings">
              <Button
                variant="outline"
                size="sm"
                className="rounded-2xl border-orange-200 dark:border-orange-700 hover:bg-orange-50 dark:hover:bg-orange-900/20 text-orange-700 dark:text-orange-300"
              >
                <Settings className="h-4 w-4 mr-2" />
                Settings
              </Button>
            </Link>
          </div>
        </div>

        {/* Test Component */}
        <div className="max-w-4xl mx-auto">
          <BarcodeScannerTest />
        </div>

        {/* Information Cards */}
        <div className="max-w-4xl mx-auto mt-8 grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Hardware Requirements */}
          <Card className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm border border-orange-200 dark:border-orange-700 rounded-3xl shadow-xl">
            <CardHeader className="rounded-t-3xl bg-gradient-to-r from-orange-500/10 via-amber-500/10 to-yellow-500/10 dark:from-orange-400/10 dark:via-amber-400/10 dark:to-yellow-400/10">
              <CardTitle className="flex items-center gap-2 text-lg text-gray-800 dark:text-gray-200">
                <div className="p-2 bg-gradient-to-br from-orange-500 via-amber-500 to-yellow-500 rounded-full shadow-lg">
                  <QrCode className="h-4 w-4 text-white" />
                </div>
                Hardware Requirements
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 bg-green-500 rounded-full mt-2 flex-shrink-0"></div>
                  <div>
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      USB Barcode Scanner
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Most common type, plug-and-play
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 flex-shrink-0"></div>
                  <div>
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Serial Barcode Scanner
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      RS-232 connection, requires configuration
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 bg-purple-500 rounded-full mt-2 flex-shrink-0"></div>
                  <div>
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Bluetooth Scanner
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Wireless connection, battery powered
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Troubleshooting */}
          <Card className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm border border-orange-200 dark:border-orange-700 rounded-3xl shadow-xl">
            <CardHeader className="rounded-t-3xl bg-gradient-to-r from-orange-500/10 via-amber-500/10 to-yellow-500/10 dark:from-orange-400/10 dark:via-amber-400/10 dark:to-yellow-400/10">
              <CardTitle className="flex items-center gap-2 text-lg text-gray-800 dark:text-gray-200">
                <div className="p-2 bg-gradient-to-br from-orange-500 via-amber-500 to-yellow-500 rounded-full shadow-lg">
                  <QrCode className="h-4 w-4 text-white" />
                </div>
                Troubleshooting
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 bg-red-500 rounded-full mt-2 flex-shrink-0"></div>
                  <div>
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Scanner Not Detected
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Check USB connection and device manager
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 bg-orange-500 rounded-full mt-2 flex-shrink-0"></div>
                  <div>
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Wrong Port Settings
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Verify COM port and baud rate in settings
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 bg-yellow-500 rounded-full mt-2 flex-shrink-0"></div>
                  <div>
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      No Scan Response
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Ensure scanner is in keyboard emulation mode
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Test Instructions */}
        <div className="max-w-4xl mx-auto mt-8">
          <Card className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm border border-orange-200 dark:border-orange-700 rounded-3xl shadow-xl">
            <CardHeader className="rounded-t-3xl bg-gradient-to-r from-orange-500/10 via-amber-500/10 to-yellow-500/10 dark:from-orange-400/10 dark:via-amber-400/10 dark:to-yellow-400/10">
              <CardTitle className="flex items-center gap-2 text-lg text-gray-800 dark:text-gray-200">
                <div className="p-2 bg-gradient-to-br from-orange-500 via-amber-500 to-yellow-500 rounded-full shadow-lg">
                  <QrCode className="h-4 w-4 text-white" />
                </div>
                Testing Instructions
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="space-y-3">
                  <h4 className="font-semibold text-gray-800 dark:text-gray-200">
                    Step 1: Enable Scanner
                  </h4>
                  <ol className="text-sm text-gray-600 dark:text-gray-400 space-y-2">
                    <li>1. Go to Settings → System</li>
                    <li>2. Enable &quot;Barcode Scanner&quot;</li>
                    <li>3. Configure port settings</li>
                    <li>4. Save settings</li>
                  </ol>
                </div>
                <div className="space-y-3">
                  <h4 className="font-semibold text-gray-800 dark:text-gray-200">
                    Step 2: Test Connection
                  </h4>
                  <ol className="text-sm text-gray-600 dark:text-gray-400 space-y-2">
                    <li>1. Click &quot;Test Connection&quot;</li>
                    <li>2. Check status indicators</li>
                    <li>3. Verify scanner is detected</li>
                    <li>4. Review any error messages</li>
                  </ol>
                </div>
                <div className="space-y-3">
                  <h4 className="font-semibold text-gray-800 dark:text-gray-200">
                    Step 3: Test Scanning
                  </h4>
                  <ol className="text-sm text-gray-600 dark:text-gray-400 space-y-2">
                    <li>1. Use &quot;Simulate Scan&quot; for testing</li>
                    <li>2. Scan actual barcodes</li>
                    <li>3. Check scan history</li>
                    <li>4. Verify data format</li>
                  </ol>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
