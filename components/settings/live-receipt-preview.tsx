"use client";

import React, { useState } from "react";
import Image from "next/image";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Printer, Receipt, Eye, CheckCircle2 } from "lucide-react";
import type { PrinterConfig } from "@/lib/settings";

interface LiveReceiptPreviewProps {
  account: {
    restaurantName?: string;
    phone?: string;
    address?: string;
    email?: string;
    logo?: string;
  };
  taxConfiguration?: {
    enabled?: boolean;
    appliesToPos?: boolean;
    appliesToRooms?: boolean;
    appliesToEvents?: boolean;
    graEVatRate?: number;
    vatRate?: number;
    nhilRate?: number;
    getFundRate?: number;
    covidLevyRate?: number;
    graEVatEnabled?: boolean;
    vatEnabled?: boolean;
    nhilEnabled?: boolean;
    getFundEnabled?: boolean;
    covidLevyEnabled?: boolean;
    levyDisplayMode?: "amount" | "percentage";
  };
  printerConfig?: PrinterConfig;
  currency?: string;
}

export function LiveReceiptPreview({
  account,
  taxConfiguration,
  printerConfig,
  currency = "GHS",
}: LiveReceiptPreviewProps) {
  const [paperWidth, setPaperWidth] = useState<"80" | "58">("80");

  const is80mm = paperWidth === "80";
  const curr = currency === "GHS" ? "₵" : currency;

  // Sample receipt items
  const items = [
    { name: "Jollof Rice w/ Grilled Chicken", qty: 1, price: 45.0 },
    { name: "Fresh Palm Wine (Calabash)", qty: 2, price: 15.0 },
  ];

  const subtotal = items.reduce((sum, item) => sum + item.qty * item.price, 0); // 75.00

  // Calculate taxes if enabled
  const taxesEnabled = taxConfiguration?.enabled ?? true;
  const isVatEnabled = taxesEnabled && (taxConfiguration?.vatEnabled !== false);
  const isNhilEnabled = taxesEnabled && (taxConfiguration?.nhilEnabled !== false);
  const isGetFundEnabled = taxesEnabled && (taxConfiguration?.getFundEnabled !== false);
  const isCovidEnabled = taxesEnabled && Boolean(taxConfiguration?.covidLevyEnabled);
  const isGraEVatChannel = taxesEnabled && (taxConfiguration?.graEVatEnabled !== false);

  const vatRate = taxConfiguration?.vatRate ?? 15;
  const nhilRate = taxConfiguration?.nhilRate ?? 2.5;
  const getFundRate = taxConfiguration?.getFundRate ?? 2.5;
  const covidRate = taxConfiguration?.covidLevyRate ?? 0;

  const nhilAmount = isNhilEnabled ? Number((subtotal * (nhilRate / 100)).toFixed(2)) : 0;
  const getFundAmount = isGetFundEnabled ? Number((subtotal * (getFundRate / 100)).toFixed(2)) : 0;
  const covidAmount = isCovidEnabled ? Number((subtotal * (covidRate / 100)).toFixed(2)) : 0;
  const vatTaxableBase = subtotal + nhilAmount + getFundAmount + covidAmount;
  const vatAmount = isVatEnabled ? Number((vatTaxableBase * (vatRate / 100)).toFixed(2)) : 0;

  const totalTax = nhilAmount + getFundAmount + covidAmount + vatAmount;
  const grandTotal = subtotal + totalTax;

  const displayMode = taxConfiguration?.levyDisplayMode || "amount";
  const includeLogo = printerConfig?.includeLogo ?? true;
  const includeBarcode = printerConfig?.includeBarcode ?? true;
  const includeFooter = printerConfig?.includeFooter ?? true;

  return (
    <Card className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm border border-orange-200 dark:border-orange-700 rounded-3xl shadow-xl overflow-hidden">
      <CardHeader className="bg-gradient-to-r from-orange-500/10 via-amber-500/10 to-yellow-500/10 dark:from-orange-400/10 dark:via-amber-400/10 dark:to-yellow-400/10">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg text-gray-800 dark:text-gray-200">
              <Receipt className="h-5 w-5 text-orange-600 dark:text-orange-400" />
              Live Thermal Receipt Preview
            </CardTitle>
            <CardDescription className="text-xs sm:text-sm">
              Real-time thermal slip simulation based on current tax & printer configurations
            </CardDescription>
          </div>
          <div className="flex items-center gap-1.5 self-start sm:self-auto bg-white/80 dark:bg-gray-900/80 p-1 rounded-xl border border-orange-200 dark:border-orange-800 text-xs">
            <span className="text-muted-foreground px-2 font-medium">Width:</span>
            <Button
              type="button"
              variant={is80mm ? "default" : "ghost"}
              size="sm"
              onClick={() => setPaperWidth("80")}
              className={`h-7 px-2.5 text-xs rounded-lg ${
                is80mm
                  ? "bg-orange-500 hover:bg-orange-600 text-white"
                  : "text-gray-700 dark:text-gray-300"
              }`}
            >
              80mm (Standard)
            </Button>
            <Button
              type="button"
              variant={!is80mm ? "default" : "ghost"}
              size="sm"
              onClick={() => setPaperWidth("58")}
              className={`h-7 px-2.5 text-xs rounded-lg ${
                !is80mm
                  ? "bg-orange-500 hover:bg-orange-600 text-white"
                  : "text-gray-700 dark:text-gray-300"
              }`}
            >
              58mm (Compact)
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-4 sm:p-6 flex flex-col items-center justify-center bg-gray-50/60 dark:bg-gray-950/40">
        {/* Receipt paper container */}
        <div
          className={`bg-white dark:bg-zinc-950 text-black dark:text-zinc-100 p-5 rounded-lg shadow-xl border border-zinc-200 dark:border-zinc-800 font-mono transition-all duration-300 text-xs sm:text-sm leading-relaxed ${
            is80mm ? "w-full max-w-[360px]" : "w-full max-w-[280px]"
          }`}
          style={{ filter: "drop-shadow(0 4px 6px -1px rgba(0, 0, 0, 0.1))" }}
        >
          {/* Top Paper Cut simulation */}
          <div className="border-b-2 border-dashed border-zinc-300 dark:border-zinc-700 pb-3 mb-3 text-center">
            {includeLogo && account.logo ? (
              <div className="flex justify-center mb-2">
                <div className="relative h-12 w-28">
                  <Image
                    src={account.logo}
                    alt="Receipt Logo"
                    fill
                    className="object-contain filter grayscale contrast-125"
                    unoptimized
                  />
                </div>
              </div>
            ) : null}

            <h3 className="font-bold text-sm sm:text-base tracking-wide uppercase text-center">
              {account.restaurantName || "Kumbisaly Heritage"}
            </h3>
            {account.address && (
              <p className="text-[11px] text-zinc-600 dark:text-zinc-400 mt-0.5 whitespace-pre-wrap">
                {account.address}
              </p>
            )}
            {account.phone && (
              <p className="text-[11px] text-zinc-600 dark:text-zinc-400">Tel: {account.phone}</p>
            )}
            {isGraEVatChannel && (
              <div className="mt-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-zinc-100 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700">
                <span>GRA E-VAT CERTIFIED</span>
              </div>
            )}
          </div>

          {/* Metadata */}
          <div className="text-[11px] space-y-0.5 pb-2 border-b border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400">
            <div className="flex justify-between">
              <span>Receipt #: POS-2026-089</span>
              <span>Table 4</span>
            </div>
            <div className="flex justify-between">
              <span>Date: {new Date().toLocaleDateString("en-GB")}</span>
              <span>Time: 12:45 PM</span>
            </div>
            <div className="flex justify-between">
              <span>Cashier: Ama O.</span>
              <span>Server: Kwabena</span>
            </div>
          </div>

          {/* Items Header */}
          <div className="py-2 border-b border-zinc-300 dark:border-zinc-700 text-[11px] font-semibold flex justify-between">
            <span className="w-1/2">Item Description</span>
            <span className="w-1/6 text-center">Qty</span>
            <span className="w-1/3 text-right">Price ({curr})</span>
          </div>

          {/* Line Items */}
          <div className="py-2 space-y-1.5 border-b border-zinc-200 dark:border-zinc-800 text-[11px]">
            {items.map((item, idx) => (
              <div key={idx} className="flex justify-between items-start">
                <span className="w-1/2 truncate font-medium">{item.name}</span>
                <span className="w-1/6 text-center">{item.qty}</span>
                <span className="w-1/3 text-right">{(item.qty * item.price).toFixed(2)}</span>
              </div>
            ))}
          </div>

          {/* Calculations */}
          <div className="py-2 space-y-1 text-[11px]">
            <div className="flex justify-between">
              <span className="text-zinc-600 dark:text-zinc-400">Subtotal:</span>
              <span className="font-medium">{curr} {subtotal.toFixed(2)}</span>
            </div>

            {taxesEnabled && (
              <div className="py-1 border-y border-dashed border-zinc-200 dark:border-zinc-800 space-y-0.5 text-[10px] text-zinc-600 dark:text-zinc-400">
                {isNhilEnabled && (
                  <div className="flex justify-between">
                    <span>NHIL ({nhilRate}%):</span>
                    <span>{displayMode === "percentage" ? `${nhilRate}%` : `${curr} ${nhilAmount.toFixed(2)}`}</span>
                  </div>
                )}
                {isGetFundEnabled && (
                  <div className="flex justify-between">
                    <span>GETFund ({getFundRate}%):</span>
                    <span>{displayMode === "percentage" ? `${getFundRate}%` : `${curr} ${getFundAmount.toFixed(2)}`}</span>
                  </div>
                )}
                {isCovidEnabled && (
                  <div className="flex justify-between">
                    <span>COVID-19 ({covidRate}%):</span>
                    <span>{displayMode === "percentage" ? `${covidRate}%` : `${curr} ${covidAmount.toFixed(2)}`}</span>
                  </div>
                )}
                {isVatEnabled && (
                  <div className="flex justify-between">
                    <span>Standard VAT ({vatRate}%):</span>
                    <span>{displayMode === "percentage" ? `${vatRate}%` : `${curr} ${vatAmount.toFixed(2)}`}</span>
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-between font-bold text-xs sm:text-sm pt-1.5 border-t border-zinc-800 dark:border-zinc-200">
              <span>TOTAL DUE:</span>
              <span>{curr} {grandTotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-[11px] text-zinc-500">
              <span>Payment Mode:</span>
              <span>MOMO / Cash</span>
            </div>
          </div>

          {/* Barcode & Footer */}
          <div className="pt-3 border-t-2 border-dashed border-zinc-300 dark:border-zinc-700 text-center space-y-2">
            {includeBarcode && (
              <div className="flex flex-col items-center">
                <div className="h-9 w-4/5 bg-zinc-900 dark:bg-zinc-200 flex items-center justify-center rounded-sm">
                  <span className="text-[9px] text-zinc-100 dark:text-zinc-900 tracking-widest font-mono">
                    ||| | |||| || ||| |||| | |||
                  </span>
                </div>
                <span className="text-[9px] text-zinc-500 mt-0.5">INV-2026-9812-GRA</span>
              </div>
            )}

            {includeFooter && (
              <div className="text-[10px] text-zinc-500 dark:text-zinc-400 space-y-0.5">
                <p>Medase pa ara! Thank you for dining with us.</p>
                <p className="text-[9px]">Please keep your receipt for returns & audit.</p>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
