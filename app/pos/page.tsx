"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ArrowLeft,
  Banknote,
  CreditCard,
  Delete,
  ImageIcon,
  LogOut,
  Minus,
  PhoneIcon as MobilePhone,
  Plus,
  Printer,
  QrCode,
  Save,
  Search,
  Sparkles,
  Trash,
  User,
  Utensils,
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  getMenuItems,
  getOrderNumber,
  generateOrderId,
  generateProductOrderId,
  generateProductOrderNumber,
} from "@/lib/data";
import type { MenuItem, OrderItem, ReceiptData } from "@/lib/types";
import Image from "next/image";
import { LogoDisplay } from "@/components/logo-display";
import { useAuth } from "@/components/auth-provider";
import { useSettings } from "@/components/settings-provider";
import { OrderProvider, useOrders } from "@/lib/order-context";
import { useReceiptSettings } from "@/components/receipt-settings-provider";
import {
  processPaymentWithIntegration,
  processBarcodeWithIntegration,
} from "@/lib/integration-service";
import { hasPermission, UserRole } from "@/lib/roles";
import { RoleGuard } from "@/components/role-guard";
import {
  PaymentCompletionConfirmation,
  usePaymentCompletionConfirmation,
} from "@/components/payment/payment-completion-confirmation";

function POSContent() {
  const { settings: appSettings } = useSettings();
  const receiptRef = useRef<HTMLDivElement>(null);

  // Settings are now managed via context or server-side if migrated.
  // For now, getSettings() reads from env/constants.

  const { toast } = useToast();
  const { user, logout } = useAuth();
  const { addOrder } = useOrders();
  const { settings } = useReceiptSettings();
  const [activeTab, setActiveTab] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [filteredItems, setFilteredItems] = useState<MenuItem[]>([]);
  const [currentOrder, setCurrentOrder] = useState<OrderItem[]>([]);
  const [orderType, setOrderType] = useState("dine-in");
  const [tableNumber, setTableNumber] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerNameRefused, setCustomerNameRefused] = useState(false);
  const [customerNameError, setCustomerNameError] = useState<string | null>(
    null
  );
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [barcodeInput, setBarcodeInput] = useState("");
  const [orderNumber, setOrderNumber] = useState("");
  const [orderId, setOrderId] = useState("");
  const [currentDate, setCurrentDate] = useState<Date | null>(null);
  const [isPrinting, setIsPrinting] = useState(false);
  const paymentConfirmation = usePaymentCompletionConfirmation();

  useEffect(() => {
    setCurrentDate(new Date());
    const timer = setInterval(() => setCurrentDate(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Hosts that are allowed for next/image optimization. Keep small and explicit.
  // If a user supplies images from other hosts, we fall back to a plain <img> to avoid runtime errors.
  const allowedImageHosts = new Set([
    "scontent.facc5-2.fna.fbcdn.net",
    "images.unsplash.com",
  ]);

  // Load menu items
  useEffect(() => {
    // getMenuItems is async now (fetches from API)
    getMenuItems().then((items) => {
      setMenuItems(items);
      setFilteredItems(items);
    });

    // For order numbers, we use the async getter or generate a temp one
    getOrderNumber().then((num) => setOrderNumber(num));

    setOrderId(
      generateOrderId && typeof generateOrderId === "function"
        ? generateOrderId()
        : ""
    );
  }, []);

  // Reload menu items periodically or when triggered (via polling if needed)
  // We can add a refresh button or poll. For now, initial load is enough.

  // Filter items based on search and category
  useEffect(() => {
    let filtered = menuItems;

    // Apply search filter
    if (searchQuery) {
      filtered = filtered.filter((item) =>
        item.name.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Apply category filter
    if (activeTab !== "all") {
      filtered = filtered.filter((item) => item.category === activeTab);
    }

    setFilteredItems(filtered);
  }, [searchQuery, activeTab, menuItems]);

  // Handle barcode scan
  const handleBarcodeScan = async () => {
    if (!barcodeInput.trim()) {
      toast({
        title: "Error",
        description: "Please enter a barcode",
        variant: "destructive",
      });
      return;
    }

    try {
      // Use integrated barcode processing
      const menuItem = await processBarcodeWithIntegration(barcodeInput);

      if (menuItem) {
        addItemToOrder(menuItem);
        toast({
          title: "Item Added",
          description: `${menuItem.name} added to order`,
        });
      } else {
        toast({
          title: "Item Not Found",
          description: "No item found with that barcode",
          variant: "destructive",
        });
      }
    } catch {
      toast({
        title: "Scan Error",
        description: "Failed to process barcode scan",
        variant: "destructive",
      });
    }

    setBarcodeInput("");
  };

  // Add item to current order
  const addItemToOrder = (item: MenuItem) => {
    setCurrentOrder((prev) => {
      const existingItem = prev.find((orderItem) => orderItem.id === item.id);

      if (existingItem) {
        return prev.map((orderItem) =>
          orderItem.id === item.id
            ? { ...orderItem, quantity: orderItem.quantity + 1 }
            : orderItem
        );
      } else {
        // Generate unique order ID and order number for this product
        const productOrderId = generateProductOrderId();
        const productOrderNumber = generateProductOrderNumber();

        return [
          ...prev,
          {
            ...item,
            quantity: 1,
            orderId: productOrderId,
            orderNumber: productOrderNumber,
          },
        ];
      }
    });
  };

  // Update item quantity in order
  const updateItemQuantity = (itemId: string, newQuantity: number) => {
    if (newQuantity <= 0) {
      setCurrentOrder((prev) => prev.filter((item) => item.id !== itemId));
    } else {
      setCurrentOrder((prev) =>
        prev.map((item) =>
          item.id === itemId ? { ...item, quantity: newQuantity } : item
        )
      );
    }
  };

  // Remove item from order
  const removeItemFromOrder = (itemId: string) => {
    setCurrentOrder((prev) => prev.filter((item) => item.id !== itemId));
  };

  // Calculate order total
  const calculateTotal = () => {
    return currentOrder.reduce(
      (total, item) => total + item.price * item.quantity,
      0
    );
  };

  // Get prep time for item category
  const getPrepTimeForItem = (category: string): number => {
    switch (category) {
      case "ghanaian":
        return 20;
      case "continental":
        return 25;
      case "beverages":
        return 3;
      case "desserts":
        return 10;
      case "sides":
        return 8;
      default:
        return 15;
    }
  };

  // Calculate estimated time for order
  const calculateEstimatedTime = (items: OrderItem[]): number => {
    if (items.length === 0) return 0;

    const maxPrepTime = Math.max(
      ...items.map((item) => getPrepTimeForItem(item.category))
    );
    const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);

    // Base time + additional time for multiple items
    return Math.min(maxPrepTime + Math.floor(totalItems / 2) * 5, 45);
  };

  // Validate customer name (optional, unless refused)
  const validateCustomerName = (name: string, refused: boolean): boolean => {
    if (refused) {
      setCustomerNameError(null);
      return true;
    }
    const trimmed = name.trim();
    if (!trimmed) {
      setCustomerNameError(null);
      return true; // optional field
    }
    const valid = /^[A-Za-z][A-Za-z '\-]{1,59}$/.test(trimmed);
    setCustomerNameError(valid ? null : "Enter a valid name (letters, spaces)");
    return valid;
  };

  // Process payment
  const processPayment = async () => {
    try {
      // Validate optional customer name before processing
      const ok = validateCustomerName(customerName, customerNameRefused);
      if (!ok) {
        toast({
          title: "Validation Error",
          description: customerNameError || "Invalid customer name",
          variant: "destructive",
        });
        return;
      }
      // Use integrated payment processing
      const paymentData = {
        amount: calculateTotal(),
        method: paymentMethod,
        orderNumber,
        orderId,
        items: currentOrder,
        customerName,
        customerRefused: customerNameRefused,
      };

      const success = await processPaymentWithIntegration(paymentData);

      if (success) {
        // Remove or comment out playNotificationSound if it causes media errors
        // playNotificationSound();

        // Persist sale data if needed (integration handles persistence)

        // Add order to kitchen display
        addOrder({
          orderNumber,
          items: currentOrder.map((item) => ({
            ...item,
            status: "pending" as const,
            prepTime: getPrepTimeForItem(item.category),
          })),
          total: calculateTotal(),
          orderType: orderType as "dine-in" | "takeout" | "delivery",
          tableNumber,
          customerName,
          paymentMethod,
          estimatedTime: calculateEstimatedTime(currentOrder),
        });

        // Redirect to receipt page with order data
        // router.push(
        //   `/receipt?order=${encodeURIComponent(
        //     JSON.stringify({
        //       orderNumber,
        //       items: currentOrder,
        //       total: calculateTotal(),
        //       orderType,
        //       tableNumber,
        //       customerName,
        //       paymentMethod,
        //       date: new Date().toISOString(),
        //     })
        //   )}`
        // );
        // Instead, redirect back to the Sales Terminal (POS) page
        // router.replace("/pos");

        // Reset order
        setCurrentOrder([]);
        setCustomerName("");
        setCustomerNameRefused(false);
        setTableNumber("");
        setPaymentMethod("cash");

        paymentConfirmation.trigger();

        // Fetch next order number asynchronously
        getOrderNumber().then((num) => setOrderNumber(num));

        setOrderId(
          generateOrderId && typeof generateOrderId === "function"
            ? generateOrderId()
            : ""
        );
      } else {
        if (paymentMethod === "mobile") {
          toast({
            title: "Mobile Payment Failed",
            description:
              "Transaction failed. Switched to Cash mode for fallback.",
            variant: "destructive",
          });
          setPaymentMethod("cash");
        } else {
          toast({
            title: "Payment Failed",
            description: "Failed to process payment. Please try again.",
            variant: "destructive",
          });
        }
      }
    } catch (error) {
      console.error("Payment processing error:", error);
      toast({
        title: "Payment Error",
        description: "An error occurred during payment processing",
        variant: "destructive",
      });
    }
  };

  // Validate and print receipt using silent API
  const printReceipt = async () => {
    if (isPrinting) return;
    const hasOrderNumber = !!orderNumber;
    const hasItems = currentOrder.length > 0;

    if (!hasOrderNumber || !hasItems) {
      toast({
        title: "Validation Failed",
        description: !hasOrderNumber
          ? "Order number missing"
          : "No items to print",
        variant: "destructive",
      });
      return;
    }

    setIsPrinting(true);
    try {
      const subtotal = calculateTotal();
      const taxRate = appSettings.system?.taxRate || 12.5;
      const tax = subtotal * (taxRate / 100);
      const total = subtotal + tax;

      const printData: ReceiptData = {
        orderNumber,
        orderId,
        date: new Date().toLocaleDateString(),
        time: new Date().toLocaleTimeString(),
        items: currentOrder.map((item) => ({
          name: item.name,
          quantity: item.quantity,
          price: item.price,
          total: item.price * item.quantity,
          barcode: item.barcode,
        })),
        subtotal,
        tax,
        total,
        paymentMethod,
        customerName: customerNameRefused ? "" : customerName,
        customerRefused: customerNameRefused,
        orderType,
        tableNumber,
        businessName:
          appSettings.account.restaurantName ||
          appSettings.businessName ||
          "KHH RESTAURANT",
        businessAddress:
          appSettings.account.address || appSettings.businessAddress,
        businessPhone: appSettings.account.phone || appSettings.businessPhone,
        businessEmail: appSettings.account.email || appSettings.businessEmail,
      };

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
        description: "Receipt has been sent to the printer",
      });
    } catch (error) {
      console.error("Print error:", error);
      paymentConfirmation.trigger(false, "Unsuccessful");
      toast({
        title: "Print Failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setIsPrinting(false);
    }
  };

  // Generate receipt content
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _generateReceiptContent = () => {
    const date = new Date();
    const subtotal = calculateTotal();
    const tax = subtotal * 0.125;
    const total = subtotal + tax;

    const businessName =
      appSettings.account.restaurantName ||
      appSettings.businessName ||
      "Kumbisaly Heritage Restaurant";
    const businessAddress =
      appSettings.account.address ||
      appSettings.businessAddress ||
      "Offinso - Abofour, Ashanti, Ghana.";
    const businessPhone =
      appSettings.account.phone || appSettings.businessPhone || "0535975442";

    return `
      <div class="receipt">
        <div class="header">
          <h2>${businessName}</h2>
          <p>${businessAddress}</p>
          <p>Tel: ${businessPhone}</p>
        </div>
        
        <div>
          <p><strong>Order #:</strong> ${orderNumber}</p>
          ${orderId ? `<p><strong>Order ID:</strong> ${orderId}</p>` : ""}
          <p><strong>Date:</strong> ${date.toLocaleDateString()}</p>
          <p><strong>Time:</strong> ${date.toLocaleTimeString()}</p>
          <p><strong>Type:</strong> ${orderType.toUpperCase()}</p>
          ${tableNumber ? `<p><strong>Table:</strong> ${tableNumber}</p>` : ""}
          ${
            customerNameRefused
              ? `<p><strong>Customer:</strong> Refused</p>`
              : customerName
                ? `<p><strong>Customer:</strong> ${customerName}</p>`
                : ""
          }
        </div>
        
  <hr style="border: 1px solid hsl(var(--border)); margin: 20px 0;">
        
        <div>
          ${currentOrder
            .map(
              (item) => `
            <div class="item">
              <span>${item.name} x${item.quantity}</span>
              <span>₵${(item.price * item.quantity).toFixed(2)}</span>
            </div>
          `
            )
            .join("")}
        </div>
        
        <div class="total">
          <div class="item">
            <span>Subtotal:</span>
            <span>₵${subtotal.toFixed(2)}</span>
          </div>
          <div class="item">
            <span>Tax (12.5%):</span>
            <span>₵${tax.toFixed(2)}</span>
          </div>
          <div class="item">
            <span>TOTAL:</span>
            <span>₵${total.toFixed(2)}</span>
          </div>
        </div>
        
        <div class="footer">
          <p>${
            appSettings.system.thermalPrinter.footerText ||
            "Thank you for your visit!"
          }</p>
          <p>Please come again</p>
        </div>
      </div>
    `;
  };

  const handleLogout = () => {
    logout();
    toast({
      title: "Signed Out",
      description: "You have been successfully signed out",
    });
  };

  if (!user || !hasPermission(user.role as UserRole, "pos")) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen">
        <h2 className="text-2xl font-bold text-red-600 mb-4">Access Denied</h2>
        <p className="text-gray-700 dark:text-gray-300">
          You do not have permission to access the POS Terminal.
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen w-full flex-col bg-gradient-to-br from-orange-50 via-amber-50 to-yellow-100 dark:from-orange-950 dark:via-amber-950 dark:to-yellow-950">
      <header className="sticky top-0 z-10 flex h-16 items-center gap-4 border-b bg-white/80 dark:bg-gray-900/80 backdrop-blur-md px-4 md:px-6 border-orange-200 dark:border-orange-700">
        <Link
          href="/"
          className="flex items-center gap-2 hover:opacity-80 transition-opacity"
        >
          <ArrowLeft className="h-5 w-5 text-orange-600 dark:text-orange-400" />
          <LogoDisplay size="sm" />
          <Utensils className="h-6 w-6 text-orange-600 dark:text-orange-400" />
          <h1 className="text-lg font-semibold text-gray-800 dark:text-gray-200">
            Sales Terminal
          </h1>
        </Link>
        <div className="ml-auto flex items-center gap-2">
          <div className="flex items-center gap-2 px-3 py-1 bg-gradient-to-r from-orange-50 via-amber-50 to-yellow-50 dark:from-orange-900/30 dark:via-amber-900/30 dark:to-yellow-900/30 rounded-full border border-orange-200 dark:border-orange-700">
            <User className="h-4 w-4 text-orange-600 dark:text-orange-400" />
            <span className="text-sm font-medium text-orange-700 dark:text-orange-300">
              {user.name}
            </span>
            <Badge
              variant="outline"
              className="text-xs border-orange-300 dark:border-orange-600 text-orange-600 dark:text-orange-400"
            >
              {user.role}
            </Badge>
          </div>
          <Badge
            variant="outline"
            className="text-sm border-orange-200 dark:border-orange-700 text-orange-700 dark:text-orange-300"
          >
            Order #{orderNumber}
          </Badge>
          {orderId && (
            <Badge
              variant="outline"
              className="text-sm border-orange-200 dark:border-orange-700 text-orange-700 dark:text-orange-300"
            >
              ID {orderId.slice(-8)}
            </Badge>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={handleLogout}
            className="border-orange-200 dark:border-orange-700 hover:bg-orange-50 dark:hover:bg-orange-900/20 text-orange-700 dark:text-orange-300 rounded-2xl bg-transparent"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <main className="flex flex-1 overflow-hidden flex-col lg:flex-row">
        {/* Menu Items Section */}
        <div className="flex flex-col w-full lg:w-2/3 border-r border-orange-200 dark:border-orange-700">
          <div className="p-4 border-b border-orange-200 dark:border-orange-700 bg-gradient-to-r from-orange-50/50 via-amber-50/50 to-yellow-50/50 dark:from-orange-900/20 dark:via-amber-900/20 dark:to-yellow-900/20">
            <div className="flex flex-col md:flex-row items-stretch md:items-center gap-2 mb-4">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  type="search"
                  placeholder="Search menu items..."
                  className="pl-8 rounded-2xl border-orange-200 dark:border-orange-700 focus:border-orange-500 dark:focus:border-orange-400 bg-white/50 dark:bg-gray-800/50"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <div className="flex items-center gap-2">
                <Label
                  htmlFor="barcode"
                  className="text-sm font-medium text-orange-700 dark:text-orange-300"
                >
                  Barcode:
                </Label>
                <div className="flex">
                  <Input
                    id="barcode"
                    placeholder="Scan barcode..."
                    value={barcodeInput}
                    onChange={(e) => setBarcodeInput(e.target.value)}
                    className="w-40 rounded-l-2xl border-orange-200 dark:border-orange-700 focus:border-orange-500 dark:focus:border-orange-400 bg-white/50 dark:bg-gray-800/50"
                  />
                  <Button
                    variant="secondary"
                    onClick={handleBarcodeScan}
                    className="ml-0 rounded-l-none rounded-r-2xl bg-gradient-to-r from-orange-100 via-amber-100 to-yellow-100 dark:from-orange-800/50 dark:via-amber-800/50 dark:to-yellow-800/50 border-orange-200 dark:border-orange-700 hover:from-orange-200 hover:via-amber-200 hover:to-yellow-200 dark:hover:from-orange-700/50 dark:hover:via-amber-700/50 dark:hover:to-yellow-700/50"
                  >
                    <QrCode className="h-4 w-4 mr-2 text-orange-600 dark:text-orange-400" />
                    Scan
                  </Button>
                </div>
              </div>
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid grid-cols-6 bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm border border-orange-200 dark:border-orange-700 rounded-full p-1">
                <TabsTrigger
                  value="all"
                  className="rounded-full data-[state=active]:bg-gradient-to-r data-[state=active]:from-orange-500 data-[state=active]:via-amber-500 data-[state=active]:to-yellow-500 data-[state=active]:text-white"
                >
                  All
                </TabsTrigger>
                <TabsTrigger
                  value="ghanaian"
                  className="rounded-full data-[state=active]:bg-gradient-to-r data-[state=active]:from-orange-500 data-[state=active]:via-amber-500 data-[state=active]:to-yellow-500 data-[state=active]:text-white"
                >
                  Ghanaian
                </TabsTrigger>
                <TabsTrigger
                  value="continental"
                  className="rounded-full data-[state=active]:bg-gradient-to-r data-[state=active]:from-orange-500 data-[state=active]:via-amber-500 data-[state=active]:to-yellow-500 data-[state=active]:text-white"
                >
                  Continental
                </TabsTrigger>
                <TabsTrigger
                  value="beverages"
                  className="rounded-full data-[state=active]:bg-gradient-to-r data-[state=active]:from-orange-500 data-[state=active]:via-amber-500 data-[state=active]:to-yellow-500 data-[state=active]:text-white"
                >
                  Beverages
                </TabsTrigger>
                <TabsTrigger
                  value="desserts"
                  className="rounded-full data-[state=active]:bg-gradient-to-r data-[state=active]:from-orange-500 data-[state=active]:via-amber-500 data-[state=active]:to-yellow-500 data-[state=active]:text-white"
                >
                  Desserts
                </TabsTrigger>
                <TabsTrigger
                  value="sides"
                  className="rounded-full data-[state=active]:bg-gradient-to-r data-[state=active]:from-orange-500 data-[state=active]:via-amber-500 data-[state=active]:to-yellow-500 data-[state=active]:text-white"
                >
                  Sides
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          <ScrollArea className="flex-1 p-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {filteredItems.map((item) => (
                <Card
                  key={item.id}
                  className="cursor-pointer hover:border-orange-400 dark:hover:border-orange-500 transition-all duration-300 overflow-hidden bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm border border-orange-200 dark:border-orange-700 rounded-3xl hover:scale-105 hover:shadow-xl relative"
                  onClick={() => addItemToOrder(item)}
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-orange-100/20 via-amber-100/20 to-yellow-100/20 dark:from-orange-900/20 dark:via-amber-900/20 dark:to-yellow-900/20"></div>
                  <div className="relative h-32 w-full bg-muted rounded-t-3xl overflow-hidden">
                    {(() => {
                      if (!item.image) {
                        return (
                          <div className="flex items-center justify-center h-full">
                            <ImageIcon className="h-8 w-8 text-muted-foreground" />
                          </div>
                        );
                      }

                      try {
                        const url = new URL(item.image);
                        if (allowedImageHosts.has(url.hostname)) {
                          return (
                            <Image
                              src={item.image}
                              alt={item.name}
                              fill
                              className="object-cover"
                              sizes="(max-width: 768px) 50vw, (max-width: 1200px) 33vw, 25vw"
                              onLoad={(e) => {
                                const imgEl =
                                  e.currentTarget as HTMLImageElement;
                                if (!imgEl.naturalWidth)
                                  imgEl.style.display = "none";
                              }}
                            />
                          );
                        }
                      } catch {
                        // If URL parsing fails, fall back to the unoptimized Image below
                      }

                      // Fallback: use next/image without optimization to avoid domain validation
                      // This keeps consistent rendering but skips Next's image optimization for unknown hosts
                      return (
                        <Image
                          src={item.image}
                          alt={item.name}
                          fill
                          unoptimized
                          className="object-cover"
                          sizes="(max-width: 768px) 50vw, (max-width: 1200px) 33vw, 25vw"
                          onLoad={(e) => {
                            const imgEl = e.currentTarget as HTMLImageElement;
                            if (!imgEl.naturalWidth)
                              imgEl.style.display = "none";
                          }}
                        />
                      );
                    })()}
                    {!item.inStock && (
                      <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                        <Badge variant="destructive" className="rounded-full">
                          Out of Stock
                        </Badge>
                      </div>
                    )}
                  </div>
                  <CardHeader className="p-3 relative z-10">
                    <CardTitle className="text-sm line-clamp-2">
                      {item.name}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-3 pt-0 relative z-10">
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {item.description}
                    </p>
                  </CardContent>
                  <CardFooter className="p-3 pt-0 flex justify-between items-center relative z-10">
                    <Badge
                      variant="secondary"
                      className="text-xs rounded-full bg-gradient-to-r from-orange-100 via-amber-100 to-yellow-100 dark:from-orange-800/50 dark:via-amber-800/50 dark:to-yellow-800/50 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-700"
                    >
                      {item.category}
                    </Badge>
                    <span className="font-bold text-lg text-orange-600 dark:text-orange-400">
                      ₵{item.price.toFixed(2)}
                    </span>
                  </CardFooter>
                </Card>
              ))}

              {filteredItems.length === 0 && (
                <div className="col-span-full flex justify-center items-center h-40">
                  <p className="text-muted-foreground">No items found</p>
                </div>
              )}
            </div>
          </ScrollArea>
        </div>

        {/* Order Section */}
        <div className="flex flex-col w-full lg:w-1/3 bg-gradient-to-b from-orange-50/30 via-amber-50/30 to-yellow-50/30 dark:from-orange-900/10 dark:via-amber-900/10 dark:to-yellow-900/10">
          <div className="p-4 border-b border-orange-200 dark:border-orange-700">
            <h2 className="font-semibold text-lg mb-2 text-orange-800 dark:text-orange-200">
              Current Order
            </h2>
            <div className="grid grid-cols-2 gap-2 mb-4">
              <div>
                <Label
                  htmlFor="order-type"
                  className="text-sm font-medium text-orange-700 dark:text-orange-300"
                >
                  Order Type
                </Label>
                <Select value={orderType} onValueChange={setOrderType}>
                  <SelectTrigger
                    id="order-type"
                    className="rounded-2xl border-orange-200 dark:border-orange-700 focus:border-orange-500 dark:focus:border-orange-400 bg-white/50 dark:bg-gray-800/50"
                  >
                    <SelectValue placeholder="Select order type" />
                  </SelectTrigger>
                  <SelectContent className="rounded-2xl border-orange-200 dark:border-orange-700">
                    <SelectItem value="dine-in">Dine In</SelectItem>
                    <SelectItem value="takeout">Takeout</SelectItem>
                    <SelectItem value="delivery">Delivery</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {orderType === "dine-in" ? (
                <div>
                  <Label
                    htmlFor="table-number"
                    className="text-sm font-medium text-orange-700 dark:text-orange-300"
                  >
                    Table Number
                  </Label>
                  <Input
                    id="table-number"
                    placeholder="Enter table #"
                    value={tableNumber}
                    onChange={(e) => setTableNumber(e.target.value)}
                    className="rounded-2xl border-orange-200 dark:border-orange-700 focus:border-orange-500 dark:focus:border-orange-400 bg-white/50 dark:bg-gray-800/50"
                  />
                </div>
              ) : (
                <div>
                  <Label
                    htmlFor="customer-name"
                    className="text-sm font-medium text-orange-700 dark:text-orange-300"
                  >
                    Customer Name (optional)
                  </Label>
                  <Input
                    id="customer-name"
                    placeholder={
                      customerNameRefused ? "Not provided" : "Enter name"
                    }
                    value={customerName}
                    onChange={(e) => {
                      const val = e.target.value;
                      setCustomerName(val);
                      validateCustomerName(val, customerNameRefused);
                    }}
                    disabled={customerNameRefused}
                    aria-invalid={!!customerNameError}
                    aria-errormessage={
                      customerNameError ? "customer-name-error" : undefined
                    }
                    className="rounded-2xl border-orange-200 dark:border-orange-700 focus:border-orange-500 dark:focus:border-orange-400 bg-white/50 dark:bg-gray-800/50"
                  />
                  {customerNameError && (
                    <p
                      id="customer-name-error"
                      className="mt-1 text-xs text-red-600"
                    >
                      {customerNameError}
                    </p>
                  )}
                  <div className="mt-2 flex items-center gap-2">
                    <Checkbox
                      id="customer-refused"
                      checked={customerNameRefused}
                      onCheckedChange={(checked) => {
                        const isChecked = !!checked;
                        setCustomerNameRefused(isChecked);
                        if (isChecked) {
                          setCustomerName("");
                          setCustomerNameError(null);
                        }
                      }}
                    />
                    <Label
                      htmlFor="customer-refused"
                      className="text-xs text-gray-600 dark:text-gray-400"
                    >
                      Customer refused to provide name
                    </Label>
                  </div>
                </div>
              )}
            </div>
          </div>

          <ScrollArea className="flex-1 p-4">
            {currentOrder.length > 0 ? (
              <div className="space-y-4">
                {currentOrder.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between p-3 bg-white/50 dark:bg-gray-800/50 rounded-2xl border border-orange-200 dark:border-orange-700"
                  >
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <h3 className="font-semibold text-orange-800 dark:text-orange-200">
                          {item.name}
                        </h3>
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          {item.orderNumber && (
                            <span className="block">#{item.orderNumber}</span>
                          )}
                          {item.orderId && (
                            <span className="block text-xs">
                              ID: {item.orderId.slice(-8)}
                            </span>
                          )}
                        </div>
                      </div>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                        {item.description}
                      </p>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              updateItemQuantity(item.id, item.quantity - 1)
                            }
                            className="h-6 w-6 p-0 rounded-full border-orange-200 dark:border-orange-700 text-orange-700 dark:text-orange-300 hover:bg-orange-50 dark:hover:bg-orange-900/20"
                          >
                            <Minus className="h-3 w-3" />
                          </Button>
                          <span className="text-sm font-medium text-orange-800 dark:text-orange-200 min-w-[20px] text-center">
                            {item.quantity}
                          </span>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              updateItemQuantity(item.id, item.quantity + 1)
                            }
                            className="h-6 w-6 p-0 rounded-full border-orange-200 dark:border-orange-700 text-orange-700 dark:text-orange-300 hover:bg-orange-50 dark:hover:bg-orange-900/20"
                          >
                            <Plus className="h-3 w-3" />
                          </Button>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-semibold text-orange-800 dark:text-orange-200">
                            ₵{(item.price * item.quantity).toFixed(2)}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            ₵{item.price.toFixed(2)} each
                          </p>
                        </div>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => removeItemFromOrder(item.id)}
                      className="ml-2 h-8 w-8 p-0 rounded-full border-red-200 dark:border-red-700 text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/20"
                    >
                      <Trash className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-40">
                <div className="p-4 bg-gradient-to-br from-orange-100 via-amber-100 to-yellow-100 dark:from-orange-900/30 dark:via-amber-900/30 dark:to-yellow-900/30 rounded-full mb-4">
                  <Sparkles className="h-8 w-8 text-orange-600 dark:text-orange-400" />
                </div>
                <p className="text-muted-foreground font-medium">
                  No items in order
                </p>
                <p className="text-sm text-muted-foreground">
                  Click on menu items to add them
                </p>
              </div>
            )}
          </ScrollArea>

          {/* Process Payment Section */}
          <div className="p-4 border-t border-orange-200 dark:border-orange-700 bg-gradient-to-r from-orange-50/30 via-amber-50/30 to-yellow-50/30 dark:from-orange-900/20 dark:via-amber-900/20 dark:to-yellow-900/20">
            <div className="mb-4">
              <h3 className="font-semibold text-lg mb-3 text-orange-800 dark:text-orange-200">
                Process Payment
              </h3>

              {/* Payment Method Selection */}
              <Card className="bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm border border-orange-200 dark:border-orange-700 rounded-2xl p-4 mb-4 relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-r from-orange-50/20 via-amber-50/20 to-yellow-50/20 dark:from-orange-900/10 dark:via-amber-900/10 dark:to-yellow-900/10"></div>
                <div className="relative z-10">
                  <h4 className="font-semibold text-sm mb-3 text-orange-700 dark:text-orange-300">
                    Select Payment Method
                  </h4>

                  <RadioGroup
                    value={paymentMethod}
                    onValueChange={setPaymentMethod}
                    className="space-y-3"
                  >
                    <div className="flex items-center space-x-3 p-3 rounded-2xl bg-gradient-to-r from-orange-50 via-amber-50 to-yellow-50 dark:from-orange-900/30 dark:via-amber-900/30 dark:to-yellow-900/30 border border-orange-200 dark:border-orange-700 hover:bg-orange-100 dark:hover:bg-orange-900/50 transition-colors">
                      <RadioGroupItem
                        value="cash"
                        id="cash"
                        className="border-orange-400 text-orange-600"
                      />
                      <Label
                        htmlFor="cash"
                        className="flex items-center text-orange-700 dark:text-orange-300 cursor-pointer flex-1"
                      >
                        <Banknote className="mr-2 h-4 w-4" />
                        Cash Payment
                      </Label>
                    </div>

                    <div className="flex items-center space-x-3 p-3 rounded-2xl bg-gradient-to-r from-orange-50 via-amber-50 to-yellow-50 dark:from-orange-900/30 dark:via-amber-900/30 dark:to-yellow-900/30 border border-orange-200 dark:border-orange-700 hover:bg-orange-100 dark:hover:bg-orange-900/50 transition-colors">
                      <RadioGroupItem
                        value="card"
                        id="card"
                        className="border-orange-400 text-orange-600"
                      />
                      <Label
                        htmlFor="card"
                        className="flex items-center text-orange-700 dark:text-orange-300 cursor-pointer flex-1"
                      >
                        <CreditCard className="mr-2 h-4 w-4" />
                        Card Payment
                      </Label>
                    </div>

                    <div className="flex flex-col space-y-3 p-3 rounded-2xl bg-gradient-to-r from-orange-50 via-amber-50 to-yellow-50 dark:from-orange-900/30 dark:via-amber-900/30 dark:to-yellow-900/30 border border-orange-200 dark:border-orange-700 hover:bg-orange-100 dark:hover:bg-orange-900/50 transition-colors">
                      <div className="flex items-center space-x-3">
                        <RadioGroupItem
                          value="mobile"
                          id="mobile"
                          className="border-orange-400 text-orange-600"
                        />
                        <Label
                          htmlFor="mobile"
                          className="flex items-center text-orange-700 dark:text-orange-300 cursor-pointer flex-1"
                        >
                          <MobilePhone className="mr-2 h-4 w-4" />
                          Mobile Money
                        </Label>
                      </div>
                    </div>
                  </RadioGroup>
                </div>
              </Card>

              {/* Payment Action Buttons */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Button
                  variant="outline"
                  onClick={() => {
                    setCurrentOrder([]);
                    setPaymentMethod("cash");
                    setTableNumber("");
                    setCustomerName("");
                  }}
                  disabled={currentOrder.length === 0}
                  className="rounded-2xl border-orange-200 dark:border-orange-700 hover:bg-orange-50 dark:hover:bg-orange-900/20 text-orange-700 dark:text-orange-300 bg-transparent h-12 text-base font-medium"
                >
                  <Delete className="mr-2 h-5 w-5" />
                  Cancel Order
                </Button>

                <Button
                  onClick={processPayment}
                  disabled={currentOrder.length === 0}
                  className="rounded-2xl bg-gradient-to-r from-orange-500 via-amber-500 to-yellow-500 hover:from-orange-600 hover:via-amber-600 hover:to-yellow-600 text-white shadow-lg relative overflow-hidden h-12 text-base font-medium"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-orange-400/20 via-amber-400/20 to-yellow-400/20 animate-pulse"></div>
                  <Save className="mr-2 h-5 w-5 relative z-10" />
                  <span className="relative z-10">Complete Payment</span>
                </Button>
              </div>

              {/* Payment Summary */}
              {currentOrder.length > 0 && (
                <div className="mt-4 p-3 bg-gradient-to-r from-orange-50 via-amber-50 to-yellow-50 dark:from-orange-900/20 dark:via-amber-900/20 dark:to-yellow-900/20 rounded-2xl border border-orange-200 dark:border-orange-700">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-orange-700 dark:text-orange-300">
                      Total Amount:
                    </span>
                    <span className="text-lg font-bold text-orange-800 dark:text-orange-200">
                      ₵{(calculateTotal() * 1.125).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center mt-1">
                    <span className="text-xs text-gray-600 dark:text-gray-400">
                      Payment Method:
                    </span>
                    <span className="text-sm font-medium text-orange-700 dark:text-orange-300 capitalize">
                      {paymentMethod}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Receipt Preview Section */}
          <div className="p-4 border-t border-orange-200 dark:border-orange-700 bg-gradient-to-r from-orange-50/30 via-amber-50/30 to-yellow-50/30 dark:from-orange-900/20 dark:via-amber-900/20 dark:to-yellow-900/20">
            <div className="mb-4">
              <h3 className="font-semibold text-lg mb-3 text-orange-800 dark:text-orange-200">
                Receipt Preview{" "}
                {currentOrder.length > 0
                  ? `(${currentOrder.length} items)`
                  : "(No items)"}
                <span className="text-xs text-gray-500 ml-2">
                  (Logo: {settings?.includeLogo ? "ON" : "OFF"})
                </span>
              </h3>

              {/* Auto-generation notice */}
              {currentOrder.length > 0 && (
                <div className="mb-4 p-3 bg-gradient-to-r from-blue-50 via-cyan-50 to-blue-50 dark:from-blue-900/20 dark:via-cyan-900/20 dark:to-blue-900/20 rounded-2xl border border-blue-200 dark:border-blue-700">
                  <div className="flex items-center">
                    <div className="p-2 bg-blue-100 dark:bg-blue-900/50 rounded-full mr-3">
                      <Save className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-blue-800 dark:text-blue-200">
                        Auto-Generation Enabled
                      </p>
                      <p className="text-xs text-blue-600 dark:text-blue-400">
                        Receipt will be printed when payment is completed
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Receipt Content */}
              <Card className="receipt-print-area bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm border border-orange-200 dark:border-orange-700 rounded-2xl p-4 mb-4 relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-r from-orange-50/20 via-amber-50/20 to-yellow-50/20 dark:from-orange-900/10 dark:via-amber-900/10 dark:to-yellow-900/10"></div>
                <div
                  ref={receiptRef}
                  className="relative z-10 font-mono text-sm"
                >
                  {/* Receipt Header */}
                  <div className="text-center border-b-2 border-orange-300 dark:border-orange-600 pb-3 mb-4">
                    {settings?.includeLogo !== false && (
                      <div className="flex justify-center mb-3">
                        <LogoDisplay size="sm" />
                      </div>
                    )}
                    <h4 className="font-bold text-lg text-orange-800 dark:text-orange-200">
                      <span suppressHydrationWarning>
                        {appSettings.account.restaurantName ||
                          "Kumbisaly Heritage Restaurant"}
                      </span>
                    </h4>
                    <p className="text-xs text-gray-600 dark:text-gray-400">
                      {appSettings.account.address ||
                        "Offinso - Abofour, Ashanti, Ghana."}
                    </p>
                    <p className="text-xs text-gray-600 dark:text-gray-400">
                      Tel: {appSettings.account.phone || "0535975442"}
                    </p>
                    <p className="text-xs text-gray-600 dark:text-gray-400">
                      {appSettings.account.email ||
                        "info.kumbisalyheritagehotel@gmail.com"}
                    </p>
                  </div>

                  {/* Order Info */}
                  <div className="mb-4 space-y-1">
                    <div className="flex justify-between">
                      <span className="font-semibold">Order #:</span>
                      <span>{orderNumber || "N/A"}</span>
                    </div>
                    {orderId && (
                      <div className="flex justify-between">
                        <span className="font-semibold">Order ID:</span>
                        <span>{orderId}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="font-semibold">Date:</span>
                      <span>
                        {currentDate ? currentDate.toLocaleDateString() : ""}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-semibold">Time:</span>
                      <span>
                        {currentDate ? currentDate.toLocaleTimeString() : ""}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-semibold">Type:</span>
                      <span>{orderType.toUpperCase()}</span>
                    </div>
                    {tableNumber && (
                      <div className="flex justify-between">
                        <span className="font-semibold">Table:</span>
                        <span>{tableNumber}</span>
                      </div>
                    )}
                    {customerName && (
                      <div className="flex justify-between">
                        <span className="font-semibold">Customer:</span>
                        <span>{customerName}</span>
                      </div>
                    )}
                  </div>

                  {/* Items */}
                  <div className="border-t border-orange-200 dark:border-orange-600 pt-3 mb-4">
                    <div className="text-center text-xs text-gray-600 dark:text-gray-400 mb-2">
                      ITEM QTY PRICE TOTAL
                    </div>
                    <div className="space-y-1">
                      {currentOrder.length > 0 ? (
                        currentOrder.map((item) => (
                          <div
                            key={item.id}
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
                        ))
                      ) : (
                        <div className="text-center text-xs text-gray-500 dark:text-gray-400 py-4">
                          No items in order
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Totals */}
                  <div className="border-t-2 border-orange-300 dark:border-orange-600 pt-3 space-y-1">
                    <div className="flex justify-between">
                      <span>Subtotal:</span>
                      <span>₵{calculateTotal().toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Tax (12.5%):</span>
                      <span>₵{(calculateTotal() * 0.125).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between font-bold text-lg text-orange-700 dark:text-orange-300 border-t border-orange-200 dark:border-orange-600 pt-2">
                      <span>TOTAL:</span>
                      <span>₵{(calculateTotal() * 1.125).toFixed(2)}</span>
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
              </Card>

              {/* Receipt Action Buttons */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Button
                  onClick={printReceipt}
                  disabled={currentOrder.length === 0 || isPrinting}
                  className="rounded-2xl bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white shadow-lg relative overflow-hidden"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-blue-400/20 to-blue-500/20 animate-pulse"></div>
                  <Printer className="mr-2 h-4 w-4 relative z-10" />
                  <span className="relative z-10">
                    {isPrinting ? "Printing..." : "Print Receipt"}
                  </span>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </main>
      <PaymentCompletionConfirmation
        mounted={paymentConfirmation.mounted}
        visible={paymentConfirmation.visible}
        success={paymentConfirmation.success}
        message={paymentConfirmation.message}
      />
    </div>
  );
}

export default function POSPage() {
  return (
    <RoleGuard section="pos">
      <OrderProvider>
        <POSContent />
      </OrderProvider>
    </RoleGuard>
  );
}
