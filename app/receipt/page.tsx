"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Receipt, Printer } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { LogoDisplay } from "@/components/logo-display";
import { useReceiptSettings } from "@/components/receipt-settings-provider";
import { useSettings } from "@/components/settings-provider";
import type { SalesData, OrderItem } from "@/lib/types";
import { useSearchParams } from "next/navigation";
import { findSaleByOrderNumber } from "@/lib/data";
import { RoleGuard } from "@/components/role-guard";
import { useReceiptStats } from "@/hooks/use-receipt-stats";
import { useAuth } from "@/components/auth-provider";
import { calculateTaxes } from "@/lib/tax";
import {
  levyRows,
  STATUTORY_LEVIES_HEADER,
  graFiscalHeaderHtml,
  graFiscalFooterHtml,
} from "@/lib/levy-presentation";
import { canonicalizeReceipt } from "@/lib/canonical-receipts";

interface ReceiptData {
  orderNumber: string;
  orderId?: string;
  date: string;
  time: string;
  items: OrderItem[];
  subtotal: number;
  tax: number;
  total: number;
  paymentMethod: string;
  customerName?: string;
  customerRefused?: boolean;
  performedBy?: { id?: string; name?: string | null; email?: string; role?: string };
  tableNumber?: string;
  orderType: "dine-in" | "takeout" | "delivery";
}

export default function ReceiptPage() {
  return (
    <RoleGuard section="receipt">
      <ReceiptContent />
    </RoleGuard>
  );
}

function ReceiptContent() {
  const { toast } = useToast();
  const { user } = useAuth();
  const { stats } = useReceiptStats();
  const { settings: receiptSettings, updateSettings: updateReceiptSettings } = useReceiptSettings();
  const { settings: appSettings } = useSettings();
  const printRef = useRef<HTMLDivElement>(null);
  const searchParams = useSearchParams();

  const [printerSize, setPrinterSize] = useState<"58mm" | "80mm" | "standard">(
    receiptSettings.paperSize || "80mm"
  );

  useEffect(() => {
    if (receiptSettings.paperSize) {
      setPrinterSize(receiptSettings.paperSize);
    }
  }, [receiptSettings.paperSize]);

  const handleSelectPrinterSize = (size: "58mm" | "80mm" | "standard") => {
    setPrinterSize(size);
    updateReceiptSettings({ paperSize: size });
  };

  // receiptData is used to store data from URL params, but the UI currently relies on foundSale.
  // Kept for potential future use or fixing the redirect logic.
  const [receiptData, setReceiptData] = useState<ReceiptData>({
    orderNumber: "",
    date: new Date().toLocaleDateString(),
    time: new Date().toLocaleTimeString(),
    items: [],
    subtotal: 0,
    tax: 0,
    total: 0,
    paymentMethod: "cash",
    orderType: "dine-in",
  });
  const [searchOrderNumber, setSearchOrderNumber] = useState("");
  const [receiptSource, setReceiptSource] = useState<"restaurant" | "hotel" | "event">(
    user?.role === "frontDesk" ? "hotel" : "restaurant",
  );
  const [foundSale, setFoundSale] = useState<SalesData | null>(null);
  const [searchTouched, setSearchTouched] = useState(false);
  const [recentLookupIds, setRecentLookupIds] = useState<Array<{ id: string; label: string; amount: number; source?: string }>>([]);

  useEffect(() => {
    let active = true;
    const loadRecentReceipts = async () => {
      try {
        const res = await fetch(`/api/receipts/lookup?recent=true&source=${receiptSource}&limit=6`, { cache: "no-store" });
        const data = res.ok ? await res.json() : null;
        if (active && data?.recentReceipts && Array.isArray(data.recentReceipts)) {
          setRecentLookupIds(data.recentReceipts);
        } else if (active) {
          setRecentLookupIds([]);
        }
      } catch {
        if (active) setRecentLookupIds([]);
      }
    };
    void loadRecentReceipts();
    return () => {
      active = false;
    };
  }, [receiptSource]);

  useEffect(() => {
    if (user?.role === "frontDesk") setReceiptSource("hotel");
  }, [user?.role]);

  const executeSearch = async (term: string, source: "restaurant" | "hotel" | "event" = receiptSource) => {
    setSearchTouched(true);
    const cleanTerm = term.trim();
    if (!cleanTerm) {
      setFoundSale(null);
      return;
    }

    try {
      const res = await fetch(`/api/receipts/lookup?query=${encodeURIComponent(cleanTerm)}&source=${source}`);
      const data = res.ok ? await res.json() : null;
      if (data?.receipt) {
        setFoundSale(data.receipt);
      } else {
        setFoundSale(null);
      }
    } catch (err) {
      console.error("Receipt lookup error:", err);
      setFoundSale(null);
    }
  };

  useEffect(() => {
    const orderParam = searchParams.get("order");
    const orderNumberParam = searchParams.get("orderNumber");
    if (orderParam) {
      try {
        const parsed = JSON.parse(orderParam);
        // Calculate subtotal, tax, and total if not present
        const subtotal =
          (parsed.items?.reduce(
            (sum: number, item: OrderItem) => {
              const unitPrice = item.discountPercent ? item.price * (1 - item.discountPercent / 100) : item.price;
              return sum + unitPrice * item.quantity;
            },
            0,
          ) as number) || 0;
        const tax = parsed.tax ?? +(subtotal * 0.125).toFixed(2);
        const total = parsed.total ?? +(subtotal + tax).toFixed(2);
        setReceiptData({
          ...parsed,
          subtotal,
          tax,
          total,
          date: parsed.date
            ? new Date(parsed.date).toLocaleDateString()
            : new Date().toLocaleDateString(),
          time: parsed.date
            ? new Date(parsed.date).toLocaleTimeString()
            : new Date().toLocaleTimeString(),
        });
      } catch {
        // fallback to default
      }
    } else if (orderNumberParam) {
      setSearchOrderNumber(orderNumberParam);
      void executeSearch(orderNumberParam, receiptSource);
    } else {
      // Only generate order number on client after mount
      setReceiptData((prev) => ({
        ...prev,
        orderNumber: `ORD-${Date.now()}`,
      }));
    }
  }, [searchParams, receiptSource]);

  // Search handler
  const handleSearch = () => {
    void executeSearch(searchOrderNumber, receiptSource);
  };

  // Optionally, search on Enter
  const handleSearchInputKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
  ) => {
    if (e.key === "Enter" && !e.nativeEvent.isComposing && e.keyCode !== 229) {
      handleSearch();
    }
  };

  const validateReceiptPreview = () => {
    const node = printRef.current;
    if (!node) return { ok: false, reason: "preview_missing" } as const;
    const styles = getComputedStyle(node);
    const rect = node.getBoundingClientRect();
    const expectedWidth = receiptSettings.paperSize === "58mm" ? 232 : 320; // matches class widths
    const widthMatches = Math.round(rect.width) === expectedWidth;
    const fontIsMono = styles.fontFamily?.toLowerCase().includes("mono");
    const hasOrderNumber = !!foundSale?.orderNumber;
    const hasItems = !!foundSale?.items && foundSale!.items.length > 0;
    if (!widthMatches)
      return {
        ok: false,
        reason: "width_mismatch",
        rectWidth: rect.width,
        expectedWidth,
      } as const;
    if (!fontIsMono)
      return {
        ok: false,
        reason: "font_mismatch",
        fontFamily: styles.fontFamily,
      } as const;
    if (!hasOrderNumber) return { ok: false, reason: "order_missing" } as const;
    if (!hasItems) return { ok: false, reason: "items_missing" } as const;
    return { ok: true } as const;
  };

  const handlePrint = async () => {
    const validation = validateReceiptPreview();
    if (!validation.ok) {
      const msg =
        validation.reason === "preview_missing"
          ? "Receipt preview not found"
          : validation.reason === "width_mismatch"
            ? `Width mismatch: got ${Math.round(validation.rectWidth)}px, expected ${validation.expectedWidth}px`
            : validation.reason === "font_mismatch"
              ? `Font mismatch: got ${validation.fontFamily}`
              : validation.reason === "order_missing"
                ? "Order number missing"
                : "Items missing";
      toast({
        title: "Validation Failed",
        description: msg,
        variant: "destructive",
      });
      return;
    }

    const currentSource = (foundSale?.source as "restaurant" | "hotel" | "event") || receiptSource;
    const entityId = String(foundSale?.orderId ?? foundSale?.id ?? foundSale?.orderNumber ?? searchOrderNumber);
    const receipt = canonicalizeReceipt({
      source: currentSource,
      entityId,
      receiptNumber: foundSale?.orderNumber ?? searchOrderNumber,
      printMethod: "browser",
      payload: foundSale ?? receiptData,
    });
    const persistence = await fetch("/api/canonical-receipts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(receipt),
    });
    if (!persistence.ok) {
      toast({ title: "Receipt not recorded", description: "Printing was cancelled because the canonical receipt could not be saved.", variant: "destructive" });
      return;
    }
    // Inject dynamic print page size rule so browser/printer spooler adopts the device paper format
    const styleId = "receipt-print-device-size";
    let styleEl = document.getElementById(styleId) as HTMLStyleElement | null;
    if (!styleEl) {
      styleEl = document.createElement("style");
      styleEl.id = styleId;
      document.head.appendChild(styleEl);
    }
    const pageRule =
      printerSize === "58mm"
        ? "@page { size: 58mm auto !important; margin: 2mm !important; }"
        : printerSize === "standard"
          ? "@page { size: portrait !important; margin: 10mm !important; }"
          : "@page { size: 80mm auto !important; margin: 3mm !important; }";
    styleEl.textContent = `@media print { ${pageRule} }`;

    // The receipt generator uses the browser dialog as the default, matching POS and hotel manual printing.
    window.print();
    toast({
      title: "Print dialog opened",
      description: `Optimized for ${printerSize === "58mm" ? "58mm thermal" : printerSize === "standard" ? "standard / A4" : "80mm thermal"} printer.`,
    });
  };

  return (
    <div className="flex min-h-screen w-full flex-col bg-gradient-to-br from-orange-50 via-amber-50 to-yellow-100 dark:from-orange-950 dark:via-amber-950 dark:to-yellow-950 print:bg-white print:min-h-0">
      <header className="static z-10 flex h-16 items-center gap-4 border-b bg-white/80 dark:bg-gray-900/80 backdrop-blur-md px-4 md:px-6 border-orange-200 dark:border-orange-700 print:hidden">
        <Link
          href="/"
          className="flex items-center gap-2 hover:opacity-80 transition-opacity"
        >
          <ArrowLeft className="h-5 w-5 text-orange-600 dark:text-orange-400" />
          <LogoDisplay size="sm" />
          <Receipt className="h-6 w-6 text-orange-600 dark:text-orange-400" />
          <h1 className="text-lg font-semibold text-gray-800 dark:text-gray-200">
            Receipt Generator
          </h1>
        </Link>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-2xl border border-orange-200/80 bg-white/70 p-1 text-xs dark:border-orange-800 dark:bg-gray-800/70 shadow-sm">
            <span className="font-semibold text-orange-950 dark:text-orange-200 px-2 hidden sm:inline">
              Format:
            </span>
            <button
              type="button"
              onClick={() => handleSelectPrinterSize("58mm")}
              className={`rounded-xl px-2.5 py-1 font-semibold transition ${
                printerSize === "58mm"
                  ? "bg-orange-500 text-white shadow-sm"
                  : "text-gray-700 hover:bg-orange-100 dark:text-gray-300 dark:hover:bg-gray-700"
              }`}
              title="58mm thermal receipt paper (2-inch / 32 cols)"
            >
              58mm
            </button>
            <button
              type="button"
              onClick={() => handleSelectPrinterSize("80mm")}
              className={`rounded-xl px-2.5 py-1 font-semibold transition ${
                printerSize === "80mm"
                  ? "bg-orange-500 text-white shadow-sm"
                  : "text-gray-700 hover:bg-orange-100 dark:text-gray-300 dark:hover:bg-gray-700"
              }`}
              title="80mm thermal receipt paper (3-inch / 48 cols)"
            >
              80mm
            </button>
            <button
              type="button"
              onClick={() => handleSelectPrinterSize("standard")}
              className={`rounded-xl px-2.5 py-1 font-semibold transition ${
                printerSize === "standard"
                  ? "bg-orange-500 text-white shadow-sm"
                  : "text-gray-700 hover:bg-orange-100 dark:text-gray-300 dark:hover:bg-gray-700"
              }`}
              title="Standard A4 or Letter office paper"
            >
              Standard A4
            </button>
          </div>

          <Button
            onClick={handlePrint}
            disabled={!foundSale}
            aria-disabled={!foundSale}
            title={!foundSale ? "Search for a persisted transaction before printing" : "Print the validated receipt"}
            className="rounded-2xl bg-gradient-to-r from-orange-500 via-amber-500 to-yellow-500 hover:from-orange-600 hover:via-amber-600 hover:to-yellow-600 text-white shadow-lg"
          >
            <Printer className="mr-2 h-4 w-4" />
            Print Receipt
          </Button>
        </div>
      </header>

      <main className="flex flex-1 flex-col p-4 md:p-6 print:p-0 print:m-0 print:block">
        <div className="grid gap-6 lg:grid-cols-2 print:block print:p-0 print:m-0">
          {/* Receipt Preview */}
          <Card className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm border border-orange-200 dark:border-orange-700 rounded-3xl shadow-xl relative overflow-hidden print:p-0 print:m-0 print:border-none print:shadow-none print:bg-transparent print:backdrop-blur-none print:static print:overflow-visible">
            <div className="absolute inset-0 bg-gradient-to-br from-orange-100/20 via-amber-100/20 to-yellow-100/20 dark:from-orange-900/20 dark:via-amber-900/20 dark:to-yellow-900/20 print:hidden"></div>
            <CardHeader className="relative z-10 print:hidden">
              <CardTitle className="text-lg font-bold text-orange-800 dark:text-orange-200 flex items-center gap-2">
                <Receipt className="h-5 w-5" />
                Receipt Preview
              </CardTitle>
            </CardHeader>
            <CardContent className="relative z-10 space-y-4 print:p-0 print:m-0 print:static print:space-y-0">
              {/* Search Field */}
              <div className="flex flex-wrap items-center gap-2 mb-2 print:hidden">
  {user?.role === "frontDesk" && (
  <p className="w-full text-sm text-orange-800 dark:text-orange-200">
  Front Desk view: hotel payment receipts and guest folios only.
  </p>
  )}
              <select
                value={receiptSource}
                disabled={user?.role === "frontDesk"}
                onChange={(event) => {
                  const newSource = event.target.value as "restaurant" | "hotel" | "event";
                  setReceiptSource(newSource);
                  setFoundSale(null);
                }}
                className="rounded-2xl border border-orange-200 bg-white/50 px-3 py-2 text-sm text-orange-900 dark:border-orange-700 dark:bg-gray-800/50 dark:text-orange-100"
                aria-label="Receipt source"
              >
                <option value="restaurant">Restaurant order</option>
                <option value="hotel">Hotel reservation & Guest folio</option>
                <option value="event">Event booking</option>
              </select>
              <Input
                placeholder={
                  receiptSource === "hotel"
                    ? "Enter reservation #, folio ID, or room #"
                    : receiptSource === "event"
                      ? "Enter event receipt # or event name"
                      : "Enter order number (e.g. ORD-...)"
                }
                value={searchOrderNumber}
                onChange={(e) => setSearchOrderNumber(e.target.value)}
                onKeyDown={handleSearchInputKeyDown}
                className="rounded-2xl border-orange-200 dark:border-orange-700 bg-white/50 dark:bg-gray-800/50"
              />
              <Button
                onClick={handleSearch}
                className="rounded-2xl bg-orange-500 text-white shadow-md"
              >
                Search
              </Button>
            </div>
            {recentLookupIds.length > 0 && (
              <div className="flex items-center gap-2 rounded-2xl border border-orange-200/70 bg-orange-50/50 p-2 text-xs dark:border-orange-800/60 dark:bg-orange-950/20 overflow-x-auto print:hidden">
                <span className="shrink-0 font-semibold text-orange-800 dark:text-orange-200">
                  Recent receipts:
                </span>
                <div className="flex items-center gap-1.5 overflow-x-auto whitespace-nowrap py-0.5">
                  {recentLookupIds.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setSearchOrderNumber(item.id);
                        void executeSearch(item.id, receiptSource);
                      }}
                      className="shrink-0 inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-orange-200 bg-white px-2.5 py-1 font-medium text-orange-900 transition hover:bg-orange-100 dark:border-orange-700 dark:bg-gray-800 dark:text-orange-100 dark:hover:bg-orange-900/40"
                    >
                      <span>{item.label}</span>
                      <span className="text-muted-foreground">· ₵{item.amount.toFixed(2)}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {/* Preview or Empty State */}
            {foundSale ? (
              <ScrollArea className="h-[600px] print:h-auto print:overflow-visible">
                <div
                  ref={printRef}
                  data-printer-size={printerSize}
                  className={
                    `receipt-print-area receipt bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 font-mono mx-auto print:mx-0 print:border-none print:shadow-none transition-all ` +
                    (printerSize === "58mm"
                      ? "w-[230px] max-w-[230px] p-3.5 print:p-1 text-xs"
                      : printerSize === "standard"
                        ? "w-full max-w-[560px] p-6 print:p-4 text-sm"
                        : "w-[320px] max-w-[320px] p-5 print:p-2 text-sm") +
                    (receiptSettings.fontSize === "small"
                      ? " text-xs"
                      : receiptSettings.fontSize === "large"
                        ? " text-base"
                        : "")
                  }
                >
                  {/* Receipt Header */}
                  <div className="text-center border-b-2 border-orange-300 dark:border-orange-600 pb-3 mb-4">
                    {receiptSettings.includeLogo && (
                      <div className="flex justify-center mb-3">
                        <LogoDisplay size="sm" />
                      </div>
                    )}
                    <h4 className="font-bold text-lg text-orange-800 dark:text-orange-200">
                      {receiptSettings.headerText ||
                        (foundSale.source === "hotel" || receiptSource === "hotel"
                          ? "Kumbisaly Heritage Hotel"
                          : foundSale.source === "event" || receiptSource === "event"
                            ? "Kumbisaly Heritage Events"
                            : "Kumbisaly Heritage Restaurant")}
                    </h4>
                    <p className="text-xs text-gray-600 dark:text-gray-400">
                      {receiptSettings.businessAddress ||
                        "Offinso - Abofour, Ashanti, Ghana."}
                    </p>
                    <p className="text-xs text-gray-600 dark:text-gray-400">
                      Tel: {receiptSettings.businessPhone || "0535975442"}
                    </p>
                    <p className="text-xs text-gray-600 dark:text-gray-400">
                      {receiptSettings.businessEmail ||
                        "info.kumbisalyheritagehotel@gmail.com"}
                    </p>
                  </div>
                  {/* Order Info */}
                  <div className="mb-4 space-y-1">
                    <div className="flex justify-between">
                      <span className="font-semibold">
                        {foundSale.source === "hotel" ? "Folio / Res #:" : foundSale.source === "event" ? "Event Ref #:" : "Order #:"}
                      </span>
                      <span>{foundSale.orderNumber}</span>
                    </div>
                    {foundSale.orderId && foundSale.orderId !== foundSale.orderNumber && (
                      <div className="flex justify-between">
                        <span className="font-semibold">
                          {foundSale.source === "hotel" ? "Reservation ID:" : "Order ID:"}
                        </span>
                        <span className="truncate max-w-[150px]">{foundSale.orderId}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="font-semibold">Date:</span>
                      <span>
                        {new Date(foundSale.date).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-semibold">Type:</span>
                      <span>{foundSale.orderType?.toUpperCase()}</span>
                    </div>
                    {foundSale.tableNumber && (
                      <div className="flex justify-between">
                        <span className="font-semibold">
                          {foundSale.source === "hotel" ? "Room:" : "Table:"}
                        </span>
                        <span>{foundSale.tableNumber}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="font-semibold">Staff:</span>
                      <span>{foundSale.performedBy?.name || foundSale.performedBy?.email || "Front Desk / Service"}</span>
                    </div>
                    {foundSale.customerRefused ? (
                      <div className="flex justify-between">
                        <span className="font-semibold">Customer:</span>
                        <span>Refused</span>
                      </div>
                    ) : (
                      foundSale.customerName && (
                        <div className="flex justify-between">
                          <span className="font-semibold">
                            {foundSale.source === "hotel" ? "Guest:" : foundSale.source === "event" ? "Client:" : "Customer:"}
                          </span>
                          <span>{foundSale.customerName}</span>
                        </div>
                      )
                    )}
                  </div>
                    {appSettings.system.taxConfiguration?.graEVatEnabled !== false && (
                      <div className="my-2 border-y border-dashed border-gray-400 py-1.5 text-center font-mono text-[11px] text-gray-700 dark:text-gray-300">
                        <div className="font-bold tracking-wider">* GRA E-VAT FISCAL RECEIPT *</div>
                        <div>TIN: {appSettings.system.taxConfiguration?.tin || "C0029384756"}</div>
                        <div>SDC ID: SDC-KMB-{(foundSale.orderNumber || "").replace(/[^0-9A-Z]/gi, "").slice(-6)} | INVOICE: {foundSale.orderNumber}</div>
                      </div>
                    )}
                    {/* Items */}
                    <div className="border-t border-orange-200 dark:border-orange-600 pt-3 mb-4">
                      {printerSize === "58mm" ? (
                        <div className="flex justify-between text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2 border-b border-dashed border-gray-300 dark:border-gray-600 pb-1">
                          <span>ITEM</span>
                          <span>QTY · TOTAL</span>
                        </div>
                      ) : (
                        <div className="flex justify-between text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2 border-b border-dashed border-gray-300 dark:border-gray-600 pb-1">
                          <span className="flex-1 text-left">ITEM</span>
                          <span className="w-10 text-center">QTY</span>
                          <span className="w-16 text-right">PRICE</span>
                          <span className="w-20 text-right">TOTAL</span>
                        </div>
                      )}
                      <div className="space-y-1.5">
                        {foundSale.items.map(
                          (item: OrderItem, index: number) => {
                            const pct = Number(item.discountPercent || 0);
                            const unitPrice = pct > 0 ? item.price * (1 - pct / 100) : item.price;
                            const lineTotal = unitPrice * item.quantity;

                            if (printerSize === "58mm") {
                              return (
                                <div key={index} className="space-y-0.5 text-xs py-1 border-b border-gray-100 dark:border-gray-800 last:border-b-0">
                                  <div className="font-semibold text-gray-800 dark:text-gray-200 break-words leading-tight">
                                    {item.name}
                                  </div>
                                  <div className="flex justify-between items-center text-[11px] text-gray-600 dark:text-gray-400 font-mono">
                                    <span>{item.quantity} x ₵{unitPrice.toFixed(2)}</span>
                                    <span className="font-bold text-gray-900 dark:text-gray-100">₵{lineTotal.toFixed(2)}</span>
                                  </div>
                                  {pct > 0 && (
                                    <div className="text-[10px] text-orange-600 dark:text-orange-400">
                                      (-{pct}% off: save ₵{((item.price - unitPrice) * item.quantity).toFixed(2)})
                                    </div>
                                  )}
                                </div>
                              );
                            }

                            return (
                              <div key={index} className="space-y-0.5 py-0.5">
                                <div className="flex justify-between text-xs sm:text-sm">
                                  <span className="flex-1 truncate mr-2 font-medium text-gray-800 dark:text-gray-200">{item.name}</span>
                                  <span className="w-10 text-center font-mono">{item.quantity}</span>
                                  <span className="w-16 text-right font-mono">₵{unitPrice.toFixed(2)}</span>
                                  <span className="w-20 text-right font-mono font-bold">₵{lineTotal.toFixed(2)}</span>
                                </div>
                                {pct > 0 && (
                                  <div className="flex justify-between text-[10px] text-orange-600 dark:text-orange-400 pl-2">
                                    <span>Original ₵{item.price.toFixed(2)} (-{pct}% off)</span>
                                    <span>Save ₵{((item.price - unitPrice) * item.quantity).toFixed(2)}</span>
                                  </div>
                                )}
                              </div>
                            );
                          },
                        )}
                      </div>
                    </div>
                    {/* Totals */}
                    <div className="border-t-2 border-orange-300 dark:border-orange-600 pt-3 space-y-1">
                      <div className="flex justify-between">
                        <span>Taxable Subtotal:</span>
                        <span className="font-mono">
                          ₵{Number(foundSale.subtotal ?? 0).toFixed(2)}
                        </span>
                      </div>
                      {(() => {
                        const moduleName = receiptSource === "event" ? "events" : receiptSource === "hotel" ? "rooms" : "pos";
                        const isTaxEnabled =
                          Boolean(appSettings.system.taxConfiguration?.enabled) &&
                          (moduleName === "events"
                            ? appSettings.system.taxConfiguration?.appliesToEvents !== false
                            : moduleName === "rooms"
                            ? appSettings.system.taxConfiguration?.appliesToRooms !== false
                            : appSettings.system.taxConfiguration?.appliesToPos !== false);
                        const subtotalVal = Number(foundSale.subtotal ?? 0);
                        const taxRes = isTaxEnabled
                          ? calculateTaxes(subtotalVal, appSettings.system.taxConfiguration, moduleName)
                          : { breakdown: {}, tax: 0, total: Number(foundSale.total ?? 0) };
                        const rows = isTaxEnabled ? levyRows(taxRes.breakdown, appSettings.system.taxConfiguration, subtotalVal, "₵") : [];

                        if (!isTaxEnabled || rows.length === 0) return null;

                        return (
                          <div className="space-y-0.5 pt-1.5 border-t border-dashed border-orange-200 dark:border-orange-700">
                            <div className="flex justify-between font-semibold text-xs text-orange-950 dark:text-orange-200">
                              <span>{STATUTORY_LEVIES_HEADER}</span>
                              <span className="font-mono">₵{taxRes.tax.toFixed(2)}</span>
                            </div>
                            {rows.map((levy) => (
                              <div key={levy.key} className="flex justify-between pl-2 text-[11px] text-gray-600 dark:text-gray-400">
                                <span>{levy.label}:</span>
                                <span className="font-mono">{levy.formatted}</span>
                              </div>
                            ))}
                          </div>
                        );
                      })()}
                      <div className="flex justify-between font-bold text-lg text-orange-700 dark:text-orange-300 border-t border-orange-200 dark:border-orange-600 pt-2">
                        <span>TOTAL:</span>
                        <span className="font-mono">₵{foundSale.total.toFixed(2)}</span>
                      </div>
                    </div>
                    {/* Payment Method */}
                    <div className="border-t border-orange-200 dark:border-orange-600 pt-3 mb-4">
                      <div className="flex justify-between">
                        <span className="font-semibold">Payment Method:</span>
                        <span className="capitalize">
                          {foundSale.paymentMethod}
                        </span>
                      </div>
                    </div>
                    {/* Footer */}
                    <div className="text-center mt-4 pt-3 border-t border-orange-200 dark:border-orange-600">
                      <p className="text-xs text-gray-600 dark:text-gray-400">
                        Thank you for your visit!
                      </p>
                      <p className="text-xs text-gray-600 dark:text-gray-400">
                        Please come again
                      </p>
                    </div>
                    {appSettings.system.taxConfiguration?.graEVatEnabled !== false && (
                      <div className="mt-3 border-t border-dashed border-gray-300 pt-2 text-center font-mono text-[9px] text-gray-500">
                        <div className="font-bold text-[10px] text-gray-700 dark:text-gray-300">[ GRA E-VAT VERIFIED FISCAL RECEIPT ]</div>
                        <div className="truncate text-[8px] text-gray-500">https://efiscal.gra.gov.gh/verify?tin={appSettings.system.taxConfiguration?.tin || "C0029384756"}&inv={foundSale.orderNumber}&tot={Number(foundSale.total || 0).toFixed(2)}</div>
                        <div className="mt-1 text-[8px]">Powered by KumbiAPP · Certified Fiscal Channel</div>
                      </div>
                    )}
                  </div>
                </ScrollArea>
              ) : searchTouched ? (
                <div role="status" className="flex h-64 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-destructive/40 bg-destructive/5 px-6 text-center text-muted-foreground print:hidden">
                  <Receipt className="size-8 text-destructive/70" aria-hidden="true" />
                  <span className="font-semibold text-foreground">No persisted receipt found</span>
                  <span className="text-sm">Verify the {receiptSource === "hotel" ? "reservation number, guest folio, or room number" : receiptSource === "event" ? "event booking receipt number or event name" : "order number"} and search again.</span>
                </div>
              ) : (
                <div role="status" className="flex h-64 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border bg-muted/20 px-6 text-center text-muted-foreground print:hidden">
                  <Receipt className="size-8" aria-hidden="true" />
                  <span className="font-semibold text-foreground">Receipt preview is ready</span>
                  <span className="text-sm">{receiptSource === "hotel" ? "Search for a hotel payment or checkout folio by reservation #, booking ID, or room #." : receiptSource === "event" ? "Search for an event booking receipt by event name or reference #." : "Search for a restaurant receipt by order number."}</span>
                </div>
              )}
              {/* Tracking Section */}
              {foundSale && (
                <div className="mt-4 p-3 rounded-xl border border-orange-200 dark:border-orange-700 bg-orange-50/50 dark:bg-orange-900/20 flex flex-col gap-2 print:hidden">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-orange-700 dark:text-orange-300">
                      {foundSale.source === "hotel" ? "Folio / Res #:" : foundSale.source === "event" ? "Event Ref #:" : "Order Number:"}
                    </span>
                    <span className="font-mono text-xs bg-orange-100 dark:bg-orange-800 px-2 py-1 rounded-lg">
                      {foundSale.orderNumber}
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      className="ml-2"
                      onClick={() => {
                        navigator.clipboard.writeText(foundSale.orderNumber);
                        toast({
                          title: "Copied",
                          description: "Receipt reference copied to clipboard",
                        });
                      }}
                    >
                      Copy
                    </Button>
                    {foundSale.source === "hotel" ? (
                      <Button
                        asChild
                        size="sm"
                        className="ml-2 rounded-2xl bg-orange-500 text-white"
                      >
                        <Link href="/hotels">
                          Hotel Desk
                        </Link>
                      </Button>
                    ) : foundSale.source === "event" ? (
                      <Button
                        asChild
                        size="sm"
                        className="ml-2 rounded-2xl bg-orange-500 text-white"
                      >
                        <Link href="/events">
                          Events Desk
                        </Link>
                      </Button>
                    ) : (
                      <Button
                        asChild
                        size="sm"
                        className="ml-2 rounded-2xl bg-orange-500 text-white"
                      >
                        <Link
                          href={`/refunds?orderNumber=${encodeURIComponent(foundSale.orderNumber)}`}
                        >
                          Initiate Refund
                        </Link>
                      </Button>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-3 text-xs text-gray-700 dark:text-gray-300">
                    <div>
                      <span className="font-semibold">Payment:</span>{" "}
                      {foundSale.paymentMethod}
                    </div>
                    <div>
                      <span className="font-semibold">Type:</span>{" "}
                      {foundSale.orderType}
                    </div>
                    <div>
                      <span className="font-semibold">Date:</span>{" "}
                      {new Date(foundSale.date).toLocaleDateString()}
                    </div>
                    <div>
                      <span className="font-semibold">Time:</span>{" "}
                      {new Date(foundSale.date).toLocaleTimeString()}
                    </div>
                    <div>
                      <span className="font-semibold">Total:</span> ₵
                      {foundSale.total?.toFixed(2)}
                    </div>
                  </div>
                  {foundSale.source !== "hotel" && foundSale.source !== "event" && (
                    <Link
                      href={`/track/${foundSale.orderNumber}`}
                      className="text-blue-600 underline text-xs mt-1"
                    >
                      Track this order
                    </Link>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Settings Panel */}
          <div className="space-y-6 print:hidden">
            {/* Receipt Statistics Panel */}
            <Card className="bg-white/90 dark:bg-gray-800/90 border border-orange-200 dark:border-orange-700 rounded-3xl shadow-xl relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-orange-100/20 via-amber-100/20 to-yellow-100/20 dark:from-orange-900/20 dark:via-amber-900/20 dark:to-yellow-900/20"></div>
              <CardHeader className="relative z-10">
                <CardTitle className="text-lg font-bold text-orange-800 dark:text-orange-200 flex items-center gap-2">
                  <Receipt className="h-5 w-5" />
                  Receipt Statistics
                </CardTitle>
              </CardHeader>
              <CardContent className="relative z-10">
                <div className="grid grid-cols-2 gap-2 text-sm text-gray-700 dark:text-gray-300">
                  <div>
                    Today: <span className="font-semibold">{stats.today}</span>
                  </div>
                  <div>
                    This Week:{" "}
                    <span className="font-semibold">{stats.week}</span>
                  </div>
                  <div>
                    This Month:{" "}
                    <span className="font-semibold">{stats.month}</span>
                  </div>
                  <div>
                    Total: <span className="font-semibold">{stats.total}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
            {/* Order & Folio Details */}
            <Card className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm border border-orange-200 dark:border-orange-700 rounded-3xl shadow-xl relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-orange-100/20 via-amber-100/20 to-yellow-100/20 dark:from-orange-900/20 dark:via-amber-900/20 dark:to-yellow-900/20"></div>
              <CardHeader className="relative z-10">
                <CardTitle className="text-lg font-bold text-orange-800 dark:text-orange-200 flex items-center gap-2">
                  <Receipt className="h-5 w-5" />
                  {foundSale?.source === "hotel"
                    ? "Guest Folio & Reservation Details"
                    : foundSale?.source === "event"
                      ? "Event Booking Details"
                      : "Order Details"}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 relative z-10">
                {foundSale ? (
                  <div className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
                    <div>
                      <span className="font-semibold">
                        {foundSale.source === "hotel"
                          ? "Folio / Res Number:"
                          : foundSale.source === "event"
                            ? "Event Ref Number:"
                            : "Order Number:"}
                      </span>{" "}
                      <span className="font-mono">{foundSale.orderNumber}</span>
                    </div>
                    <div>
                      <span className="font-semibold">
                        {foundSale.source === "hotel"
                          ? "Guest Name:"
                          : foundSale.source === "event"
                            ? "Client Name:"
                            : "Customer Name:"}
                      </span>{" "}
                      {foundSale.customerName || (
                        <span className="italic text-gray-400">N/A</span>
                      )}
                    </div>
                    <div>
                      <span className="font-semibold">Category / Type:</span>{" "}
                      {foundSale.orderType}
                    </div>
                    <div>
                      <span className="font-semibold">Payment Status:</span>{" "}
                      {foundSale.paymentMethod}
                    </div>
                    {foundSale.tableNumber && (
                      <div>
                        <span className="font-semibold">
                          {foundSale.source === "hotel" ? "Assigned Room:" : "Table Number:"}
                        </span>{" "}
                        {foundSale.tableNumber}
                      </div>
                    )}
                    <div>
                      <span className="font-semibold">Date:</span>{" "}
                      {new Date(foundSale.date).toLocaleDateString()}
                    </div>
                    <div>
                      <span className="font-semibold">Time:</span>{" "}
                      {new Date(foundSale.date).toLocaleTimeString()}
                    </div>
                    <div>
                      <span className="font-semibold">Total Amount:</span> ₵
                      {foundSale.total?.toFixed(2)}
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-64 text-gray-400 dark:text-gray-500 text-center px-4">
                    <span className="text-base font-medium">
                      {receiptSource === "hotel"
                        ? "Folio and room stay details will appear here once a reservation is looked up."
                        : receiptSource === "event"
                          ? "Event booking details will appear here once an event reference is found."
                          : "Order details will appear here when a valid order number is found."}
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
