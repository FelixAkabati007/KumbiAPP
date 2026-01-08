"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Receipt, Printer, Download } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { LogoDisplay } from "@/components/logo-display";
import { useReceiptSettings } from "@/components/receipt-settings-provider";
import { useSettings } from "@/components/settings-provider";
import { RefundRequestDialog } from "@/components/refund-request-dialog";
import type { SalesData, OrderItem } from "@/lib/types";
import { useSearchParams } from "next/navigation";
import { findSaleByOrderNumber } from "@/lib/data";
import { RoleGuard } from "@/components/role-guard";
import { useReceiptStats } from "@/hooks/use-receipt-stats";

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
  const { stats } = useReceiptStats();
  const { settings: receiptSettings } = useReceiptSettings();
  const { settings: appSettings } = useSettings();
  const printRef = useRef<HTMLDivElement>(null);
  const searchParams = useSearchParams();

  const [receiptData, setReceiptData] = useState<ReceiptData>({
    orderNumber: "",
    date: new Date().toLocaleDateString(),
    time: new Date().toLocaleTimeString(),
    items: [
      {
        id: "gh-001",
        name: "Jollof Rice with Chicken",
        description:
          "Traditional Ghanaian jollof rice served with grilled chicken",
        price: 25.0,
        category: "ghanaian",
        barcode: "",
        inStock: true,
        quantity: 2,
      },
      {
        id: "bev-001",
        name: "Coca Cola",
        description: "Classic Coca Cola soft drink",
        price: 5.0,
        category: "beverages",
        barcode: "049000028911",
        inStock: true,
        quantity: 2,
      },
    ],
    subtotal: 60.0,
    tax: 7.5,
    total: 67.5,
    paymentMethod: "cash",
    customerName: "John Doe",
    orderType: "dine-in",
    tableNumber: "5",
  });

  const [searchOrderNumber, setSearchOrderNumber] = useState("");
  const [foundSale, setFoundSale] = useState<SalesData | null>(null);
  const [searchTouched, setSearchTouched] = useState(false);
  const [refundDialogOpen, setRefundDialogOpen] = useState(false);

  useEffect(() => {
    const orderParam = searchParams.get("order");
    if (orderParam) {
      try {
        const parsed = JSON.parse(orderParam);
        // Calculate subtotal, tax, and total if not present
        const subtotal =
          (parsed.items?.reduce(
            (sum: number, item: OrderItem) => sum + item.price * item.quantity,
            0
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
    } else {
      // Only generate order number on client after mount
      setReceiptData((prev) => ({
        ...prev,
        orderNumber: `ORD-${Date.now()}`,
      }));
    }
  }, [searchParams]);

  // Search handler
  const handleSearch = async () => {
    setSearchTouched(true);
    if (!searchOrderNumber) {
      setFoundSale(null);
      return;
    }
    const sale = await findSaleByOrderNumber(searchOrderNumber.trim());
    setFoundSale(sale || null);
  };

  // Optionally, search on Enter
  const handleSearchInputKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>
  ) => {
    if (e.key === "Enter") handleSearch();
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

    // Silent print via API
    try {
      if (!foundSale) throw new Error("No sale data found");

      const printData = {
        orderNumber: foundSale.orderNumber,
        date: new Date(foundSale.date).toLocaleDateString(),
        time: new Date(foundSale.date).toLocaleTimeString(),
        items: foundSale.items.map((item) => ({
          name: item.name,
          quantity: item.quantity,
          price: item.price,
          total: item.price * item.quantity,
          barcode: item.barcode,
        })),
        subtotal: foundSale.items.reduce(
          (sum, item) => sum + item.price * item.quantity,
          0
        ),
        tax:
          foundSale.items.reduce(
            (sum, item) => sum + item.price * item.quantity,
            0
          ) * 0.125, // approx tax
        total: foundSale.total,
        paymentMethod: foundSale.paymentMethod,
        customerName: foundSale.customerName,
        customerRefused: foundSale.customerRefused,
        orderType: foundSale.orderType,
        tableNumber: foundSale.tableNumber,
        orderId: foundSale.orderId,
        businessName: receiptSettings.headerText,
        businessAddress: receiptSettings.businessAddress,
        businessPhone: receiptSettings.businessPhone,
        businessEmail: receiptSettings.businessEmail,
      };

      // Recalculate tax/subtotal more accurately if available or rely on calculated
      // The API expects specific ReceiptData format.

      const configs = [appSettings.system.thermalPrinter];
      if (appSettings.system.secondaryPrinter?.enabled) {
        configs.push(appSettings.system.secondaryPrinter);
      }

      const response = await fetch("/api/print", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ receipt: printData, configs }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.message || "Print failed");
      }

      toast({
        title: "Receipt Printed",
        description: "Receipt sent to printer successfully",
      });
    } catch (error) {
      console.error("Print error:", error);
      toast({
        title: "Print Failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    }
  };

  const handleDownload = () => {
    if (printRef.current) {
      const receiptContent = printRef.current.innerText;
      const blob = new Blob([receiptContent], { type: "text/plain" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `receipt-${receiptData.orderNumber}.txt`;
      a.click();
      window.URL.revokeObjectURL(url);
    }

    toast({
      title: "Receipt Downloaded",
      description: "Receipt has been downloaded as text file",
    });
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
          <Receipt className="h-6 w-6 text-orange-600 dark:text-orange-400" />
          <h1 className="text-lg font-semibold text-gray-800 dark:text-gray-200">
            Receipt Generator
          </h1>
        </Link>
        <div className="ml-auto flex items-center gap-2">
          <Button
            onClick={handleDownload}
            variant="outline"
            className="rounded-2xl border-orange-200 dark:border-orange-700 hover:bg-orange-50 dark:hover:bg-orange-900/20 text-orange-700 dark:text-orange-300 bg-transparent"
          >
            <Download className="mr-2 h-4 w-4" />
            Download
          </Button>
          <Button
            onClick={handlePrint}
            className="rounded-2xl bg-gradient-to-r from-orange-500 via-amber-500 to-yellow-500 hover:from-orange-600 hover:via-amber-600 hover:to-yellow-600 text-white shadow-lg"
          >
            <Printer className="mr-2 h-4 w-4" />
            Print Receipt
          </Button>
        </div>
      </header>

      <main className="flex flex-1 flex-col p-4 md:p-6">
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Receipt Preview */}
          <Card className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm border border-orange-200 dark:border-orange-700 rounded-3xl shadow-xl relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-orange-100/20 via-amber-100/20 to-yellow-100/20 dark:from-orange-900/20 dark:via-amber-900/20 dark:to-yellow-900/20"></div>
            <CardHeader className="relative z-10">
              <CardTitle className="text-lg font-bold text-orange-800 dark:text-orange-200 flex items-center gap-2">
                <Receipt className="h-5 w-5" />
                Receipt Preview
              </CardTitle>
            </CardHeader>
            <CardContent className="relative z-10 space-y-4">
              {/* Search Field */}
              <div className="flex items-center gap-2 mb-2">
                <Input
                  placeholder="Enter Order Number (e.g. ORD-20240101-0001)"
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
              {/* Preview or Empty State */}
              {foundSale ? (
                <ScrollArea className="h-[600px]">
                  <div
                    ref={printRef}
                    className={
                      `receipt-print-area receipt bg-white dark:bg-gray-900 p-6 rounded-2xl border border-gray-200 dark:border-gray-700 font-mono text-sm max-w-sm mx-auto ` +
                      (receiptSettings.paperSize === "58mm"
                        ? "w-[232px] max-w-[232px]"
                        : "w-[320px] max-w-[320px]") +
                      (receiptSettings.fontSize === "small"
                        ? " text-xs"
                        : receiptSettings.fontSize === "large"
                          ? " text-lg"
                          : " text-sm")
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
                        KUMBISALY HERITAGE RESTAURANT
                      </h4>
                      <p className="text-xs text-gray-600 dark:text-gray-400">
                        123 Main Street, Accra, Ghana
                      </p>
                      <p className="text-xs text-gray-600 dark:text-gray-400">
                        Tel: +233 20 123 4567
                      </p>
                    </div>
                    {/* Order Info */}
                    <div className="mb-4 space-y-1">
                      <div className="flex justify-between">
                        <span className="font-semibold">Order #:</span>
                        <span>{foundSale.orderNumber}</span>
                      </div>
                      {foundSale.orderId && (
                        <div className="flex justify-between">
                          <span className="font-semibold">ID:</span>
                          <span>{foundSale.orderId}</span>
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
                          <span className="font-semibold">Table:</span>
                          <span>{foundSale.tableNumber}</span>
                        </div>
                      )}
                      {foundSale.customerRefused ? (
                        <div className="flex justify-between">
                          <span className="font-semibold">Customer:</span>
                          <span>Refused</span>
                        </div>
                      ) : (
                        foundSale.customerName && (
                          <div className="flex justify-between">
                            <span className="font-semibold">Customer:</span>
                            <span>{foundSale.customerName}</span>
                          </div>
                        )
                      )}
                    </div>
                    {/* Items */}
                    <div className="border-t border-orange-200 dark:border-orange-600 pt-3 mb-4">
                      <div className="text-center text-xs text-gray-600 dark:text-gray-400 mb-2">
                        ITEM QTY PRICE TOTAL
                      </div>
                      <div className="space-y-1">
                        {foundSale.items.map(
                          (item: OrderItem, index: number) => (
                            <div
                              key={index}
                              className="flex justify-between text-xs"
                            >
                              <span className="flex-1 truncate mr-2">
                                {item.name}
                              </span>
                              <span className="w-8 text-center">
                                {item.quantity}
                              </span>
                              <span className="w-12 text-right">
                                ₵{item.price.toFixed(2)}
                              </span>
                              <span className="w-16 text-right font-semibold">
                                ₵{(item.price * item.quantity).toFixed(2)}
                              </span>
                            </div>
                          )
                        )}
                      </div>
                    </div>
                    {/* Totals */}
                    <div className="border-t-2 border-orange-300 dark:border-orange-600 pt-3 space-y-1">
                      <div className="flex justify-between">
                        <span>Subtotal:</span>
                        <span>
                          ₵
                          {foundSale.items
                            .reduce(
                              (sum: number, item: OrderItem) =>
                                sum + item.price * item.quantity,
                              0
                            )
                            .toFixed(2)}
                        </span>{" "}
                        {/* Changed type to any */}
                      </div>
                      <div className="flex justify-between">
                        <span>Total:</span>
                        <span>₵{foundSale.total.toFixed(2)}</span>
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
                  </div>
                </ScrollArea>
              ) : searchTouched ? (
                <div className="flex flex-col items-center justify-center h-64 text-gray-400 dark:text-gray-500">
                  <span className="text-2xl">
                    No receipt found for this order number.
                  </span>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-64 text-gray-300 dark:text-gray-600">
                  <span className="text-lg">
                    Search for a receipt by order number.
                  </span>
                </div>
              )}
              {/* Tracking Section */}
              {foundSale && (
                <div className="mt-4 p-3 rounded-xl border border-orange-200 dark:border-orange-700 bg-orange-50/50 dark:bg-orange-900/20 flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-orange-700 dark:text-orange-300">
                      Order Number:
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
                          description: "Order number copied to clipboard",
                        });
                      }}
                    >
                      Copy
                    </Button>
                    <Button
                      size="sm"
                      className="ml-2 rounded-2xl bg-orange-500 text-white"
                      onClick={() => setRefundDialogOpen(true)}
                    >
                      Initiate Refund
                    </Button>
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
                  <Link
                    href={`/track/${foundSale.orderNumber}`}
                    className="text-blue-600 underline text-xs mt-1"
                  >
                    Track this order
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Settings Panel */}
          <div className="space-y-6">
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
            {/* Order Data Editor */}
            <Card className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm border border-orange-200 dark:border-orange-700 rounded-3xl shadow-xl relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-orange-100/20 via-amber-100/20 to-yellow-100/20 dark:from-orange-900/20 dark:via-amber-900/20 dark:to-yellow-900/20"></div>
              <CardHeader className="relative z-10">
                <CardTitle className="text-lg font-bold text-orange-800 dark:text-orange-200 flex items-center gap-2">
                  <Receipt className="h-5 w-5" />
                  Order Details
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 relative z-10">
                {foundSale ? (
                  <div className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
                    <div>
                      <span className="font-semibold">Order Number:</span>{" "}
                      <span className="font-mono">{foundSale.orderNumber}</span>
                    </div>
                    <div>
                      <span className="font-semibold">Customer Name:</span>{" "}
                      {foundSale.customerName || (
                        <span className="italic text-gray-400">N/A</span>
                      )}
                    </div>
                    <div>
                      <span className="font-semibold">Order Type:</span>{" "}
                      {foundSale.orderType}
                    </div>
                    <div>
                      <span className="font-semibold">Payment Method:</span>{" "}
                      {foundSale.paymentMethod}
                    </div>
                    {foundSale.tableNumber && (
                      <div>
                        <span className="font-semibold">Table Number:</span>{" "}
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
                      <span className="font-semibold">Total:</span> ₵
                      {foundSale.total?.toFixed(2)}
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-64 text-gray-300 dark:text-gray-600">
                    <span className="text-lg">
                      Order details will appear here when a valid order number
                      is found.
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
      {/* Refund Dialog */}
      <RefundRequestDialog
        open={refundDialogOpen}
        onOpenChange={setRefundDialogOpen}
        orderData={
          foundSale
            ? {
                orderId: foundSale.orderId || `order_${foundSale.orderNumber}`,
                orderNumber: foundSale.orderNumber,
                customerName: foundSale.customerRefused
                  ? ""
                  : foundSale.customerName || "",
                customerRefused: foundSale.customerRefused,
                total: foundSale.total,
                paymentMethod: foundSale.paymentMethod,
                date: foundSale.date,
              }
            : undefined
        }
      />
    </div>
  );
}
