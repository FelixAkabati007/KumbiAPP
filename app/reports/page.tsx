"use client";

import { useState, useEffect, useMemo } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  ArrowLeft,
  BarChart3,
  TrendingUp,
  DollarSign,
  ShoppingCart,
  Calendar,
  Download,
  RotateCcw,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LogoDisplay } from "@/components/logo-display";
import type { SalesData, OrderItem, RefundRequest } from "@/lib/types";
import { getSalesData, addSaleData } from "@/lib/data";
import { RoleGuard } from "@/components/role-guard";

type KitchenOrderLike = {
  id: string;
  orderNumber: string;
  updatedAt?: string;
  createdAt?: string;
  items: OrderItem[];
  total: number;
  orderType: string;
  tableNumber?: string;
  customerName?: string;
  paymentMethod: string;
  status: string;
};

const SalesCharts = dynamic(() => import("@/components/reports/sales-charts"), {
  loading: () => (
    <div className="h-[300px] w-full animate-pulse bg-muted/20 rounded-xl mb-6" />
  ),
  ssr: false,
});

interface RawRefund {
  id: string;
  orderid: string;
  ordernumber: string;
  customername: string;
  originalamount: string | number;
  refundamount: string | number;
  paymentmethod: string;
  reason: string;
  authorizedby: string;
  status: string;
  requestedat: string;
  additionalnotes?: string;
  requestedby?: string;
  approvedby?: string;
  approvedat?: string;
  completedat?: string;
  refundmethod?: string;
  transactionid?: string;
}

interface Transaction {
  id: string;
  transaction_id: string;
  amount: string | number;
  created_at: string;
  items: OrderItem[];
  payment_method: string;
  metadata?: {
    orderNumber?: string;
    orderId?: string;
    orderType?: string;
    tableNumber?: string;
    customerName?: string;
  };
  customer_id?: string;
}

function ReportsPage() {
  const [data, setData] = useState<SalesData[]>([]);
  const [refunds, setRefunds] = useState<RefundRequest[]>([]);
  const [dateFilter, setDateFilter] = useState<string>("today");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    function migrateCompletedOrdersToSales() {
      if (typeof window === "undefined") return;
      const sales = getSalesData();
      if (sales.length === 0) {
        const kitchenOrdersRaw = localStorage.getItem("kitchen_orders");
        if (kitchenOrdersRaw) {
          try {
            const kitchenOrders = JSON.parse(
              kitchenOrdersRaw
            ) as KitchenOrderLike[];
            kitchenOrders
              .filter((order) => order.status === "completed")
              .forEach((order) => {
                addSaleData({
                  id: order.id,
                  orderNumber: order.orderNumber,
                  date:
                    order.updatedAt ||
                    order.createdAt ||
                    new Date().toISOString(),
                  items: order.items,
                  total: order.total,
                  orderType: order.orderType,
                  tableNumber: order.tableNumber,
                  customerName: order.customerName,
                  paymentMethod: order.paymentMethod,
                });
              });
          } catch {}
        }
      }
    }

    async function load() {
      migrateCompletedOrdersToSales();

      try {
        const [txRes, refRes] = await Promise.all([
          fetch("/api/transactions?limit=2000"),
          fetch("/api/refunds"),
        ]);

        const transactions = await txRes.json();
        const refundsData = await refRes.json();

        if (Array.isArray(refundsData)) {
          setRefunds(
            refundsData.map((r: RawRefund) => ({
              id: r.id,
              orderId: r.orderid,
              orderNumber: r.ordernumber,
              customerName: r.customername,
              originalAmount:
                typeof r.originalamount === "string"
                  ? Number.parseFloat(r.originalamount)
                  : r.originalamount,
              refundAmount:
                typeof r.refundamount === "string"
                  ? Number.parseFloat(r.refundamount)
                  : r.refundamount,
              paymentMethod: r.paymentmethod,
              reason: r.reason,
              authorizedBy: r.authorizedby,
              additionalNotes: r.additionalnotes,
              status: r.status as RefundRequest["status"],
              requestedBy: r.requestedby || "",
              requestedAt: new Date(r.requestedat),
              approvedBy: r.approvedby,
              approvedAt: r.approvedat ? new Date(r.approvedat) : undefined,
              completedAt: r.completedat ? new Date(r.completedat) : undefined,
              refundMethod: r.refundmethod,
              transactionId: r.transactionid,
            })) as RefundRequest[]
          );
        }

        let serverSales: SalesData[] = [];
        if (Array.isArray(transactions)) {
          serverSales = transactions.map((tx: Transaction) => ({
            id: tx.id,
            orderNumber: tx.metadata?.orderNumber || tx.transaction_id,
            orderId: tx.metadata?.orderId,
            date: tx.created_at,
            items: Array.isArray(tx.items) ? tx.items : [],
            total:
              typeof tx.amount === "string"
                ? Number.parseFloat(tx.amount)
                : tx.amount,
            orderType: tx.metadata?.orderType || "dine-in",
            tableNumber: tx.metadata?.tableNumber,
            customerName: tx.metadata?.customerName || tx.customer_id,
            paymentMethod: tx.payment_method,
          }));
        }

        const localSales = getSalesData();

        // Merge strategy: Use Server Sales, append Local Sales that are NOT in Server Sales
        const serverIds = new Set(serverSales.map((s) => s.id));
        const serverOrderNumbers = new Set(
          serverSales.map((s) => s.orderNumber)
        );

        const uniqueLocalSales = localSales.filter(
          (local) =>
            !serverIds.has(local.id) &&
            !serverOrderNumbers.has(local.orderNumber)
        );

        const allSales = [...serverSales, ...uniqueLocalSales];

        // Sort by date descending
        allSales.sort(
          (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
        );

        setData(allSales);
      } catch (error) {
        console.error("Failed to load data:", error);
        setData(getSalesData());
      }
    }

    load();
    // Real-time updates if sales data changes in another tab
    const handleStorage = (event: StorageEvent) => {
      if (event.key === "salesData") {
        load();
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  // Demo sales generator
  function generateDemoSales() {
    if (typeof window === "undefined") return;
    const demoSales = [
      {
        id: "sale-001",
        orderNumber: "ORD-20241203-101",
        date: new Date().toISOString(),
        items: [
          {
            id: "gh-001",
            name: "Jollof Rice",
            quantity: 2,
            price: 25,
            category: "ghanaian",
            description: "",
            inStock: true,
          } as OrderItem,
          {
            id: "bev-001",
            name: "Coca Cola",
            quantity: 1,
            price: 5,
            category: "beverages",
            description: "",
            inStock: true,
          } as OrderItem,
        ],
        total: 55,
        orderType: "dine-in",
        tableNumber: "3",
        customerName: "Kwame Mensah",
        paymentMethod: "cash",
      },
      {
        id: "sale-002",
        orderNumber: "ORD-20241203-102",
        date: new Date().toISOString(),
        items: [
          {
            id: "cont-001",
            name: "Grilled Chicken",
            quantity: 1,
            price: 35,
            category: "continental",
            description: "",
            inStock: true,
          } as OrderItem,
          {
            id: "side-001",
            name: "French Fries",
            quantity: 2,
            price: 10,
            category: "sides",
            description: "",
            inStock: true,
          } as OrderItem,
        ],
        total: 55,
        orderType: "takeout",
        customerName: "Ama Boateng",
        paymentMethod: "card",
      },
      {
        id: "sale-003",
        orderNumber: "ORD-20241203-103",
        date: new Date().toISOString(),
        items: [
          {
            id: "bev-002",
            name: "Sprite",
            quantity: 3,
            price: 5,
            category: "beverages",
            description: "",
            inStock: true,
          } as OrderItem,
          {
            id: "dess-001",
            name: "Chocolate Cake",
            quantity: 1,
            price: 15,
            category: "desserts",
            description: "",
            inStock: true,
          } as OrderItem,
        ],
        total: 30,
        orderType: "delivery",
        customerName: "John Smith",
        paymentMethod: "mobile",
      },
    ];
    demoSales.forEach(addSaleData);
    setData(getSalesData());
  }

  const filteredData = useMemo(() => {
    let filtered = [...data];

    // Apply date filter
    const today = new Date();
    const startOfToday = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate()
    );
    const startOfWeek = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate() - today.getDay()
    );
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    filtered = filtered.filter((item) => {
      const itemDate = new Date(item.date);
      switch (dateFilter) {
        case "today":
          return itemDate >= startOfToday;
        case "week":
          return itemDate >= startOfWeek;
        case "month":
          return itemDate >= startOfMonth;
        default:
          return true;
      }
    });

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (item) =>
          item.orderNumber.toLowerCase().includes(query) ||
          item.customerName?.toLowerCase().includes(query) ||
          item.items.some((orderItem) =>
            orderItem.name.toLowerCase().includes(query)
          )
      );
    }

    return filtered;
  }, [data, dateFilter, searchQuery]);

  const analytics = useMemo(() => {
    const totalRevenue = filteredData.reduce(
      (sum, item) => sum + item.total,
      0
    );
    const totalOrders = filteredData.length;
    const averageOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

    // Refund analytics
    const approvedRefunds = refunds.filter(
      (r) => r.status === "approved" || r.status === "completed"
    );
    const totalRefunded = approvedRefunds.reduce(
      (sum, r) => sum + r.refundAmount,
      0
    );
    const refundCount = approvedRefunds.length;

    // Category breakdown
    const categoryBreakdown: Record<
      string,
      { count: number; revenue: number }
    > = {};
    filteredData.forEach((order) => {
      order.items.forEach((item) => {
        if (!categoryBreakdown[item.category]) {
          categoryBreakdown[item.category] = { count: 0, revenue: 0 };
        }
        categoryBreakdown[item.category].count += item.quantity;
        categoryBreakdown[item.category].revenue += item.price * item.quantity;
      });
    });

    // Top selling items
    const itemSales: Record<
      string,
      { name: string; quantity: number; revenue: number }
    > = {};
    filteredData.forEach((order) => {
      order.items.forEach((item) => {
        if (!itemSales[item.id]) {
          itemSales[item.id] = { name: item.name, quantity: 0, revenue: 0 };
        }
        itemSales[item.id].quantity += item.quantity;
        itemSales[item.id].revenue += item.price * item.quantity;
      });
    });

    const topItems = Object.values(itemSales)
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 5);

    // Payment method breakdown
    const paymentMethods: Record<string, number> = {};
    filteredData.forEach((order) => {
      paymentMethods[order.paymentMethod] =
        (paymentMethods[order.paymentMethod] || 0) + 1;
    });

    return {
      totalRevenue,
      totalOrders,
      averageOrderValue,
      totalRefunded,
      refundCount,
      categoryBreakdown,
      topItems,
      paymentMethods,
    };
  }, [filteredData, refunds]);

  const getCategoryColor = (category: string) => {
    switch (category) {
      case "ghanaian":
        return "bg-red-100 text-red-800 border-red-200 dark:bg-red-900/20 dark:text-red-300 dark:border-red-700";
      case "continental":
        return "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-700";
      case "beverages":
        return "bg-cyan-100 text-cyan-800 border-cyan-200 dark:bg-cyan-900/20 dark:text-cyan-300 dark:border-cyan-700";
      case "desserts":
        return "bg-pink-100 text-pink-800 border-pink-200 dark:bg-pink-900/20 dark:text-pink-300 dark:border-pink-700";
      case "sides":
        return "bg-green-100 text-green-800 border-green-200 dark:bg-green-900/20 dark:text-green-300 dark:border-green-700";
      default:
        return "bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-900/20 dark:text-gray-300 dark:border-gray-700";
    }
  };

  const exportData = () => {
    const csvContent = [
      [
        "Order Number",
        "Date",
        "Customer",
        "Items",
        "Total (₵)",
        "Payment Method",
      ],
      ...filteredData.map((order) => [
        order.orderNumber,
        order.date,
        order.customerName || order.tableNumber || "N/A",
        order.items.map((item) => `${item.name} (${item.quantity})`).join("; "),
        order.total.toFixed(2),
        order.paymentMethod,
      ]),
    ]
      .map((row) => row.join(","))
      .join("\n");

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sales-report-${dateFilter}-${
      new Date().toISOString().split("T")[0]
    }.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  return (
    <RoleGuard section="reports">
      <div className="flex min-h-screen w-full flex-col bg-gradient-to-br from-orange-50 via-amber-50 to-yellow-100 dark:from-orange-950 dark:via-amber-950 dark:to-yellow-950">
        <header className="sticky top-0 z-10 flex h-16 items-center gap-4 border-b bg-white/80 dark:bg-gray-900/80 backdrop-blur-md px-4 md:px-6 border-orange-200 dark:border-orange-700">
          <Link
            href="/"
            className="flex items-center gap-2 hover:opacity-80 transition-opacity"
          >
            <ArrowLeft className="h-5 w-5 text-orange-600 dark:text-orange-400" />
            <LogoDisplay size="sm" />
            <BarChart3 className="h-6 w-6 text-orange-600 dark:text-orange-400" />
            <h1 className="text-lg font-semibold text-gray-800 dark:text-gray-200">
              Sales Reports
            </h1>
          </Link>
          <div className="ml-auto flex items-center gap-2">
            <Button
              onClick={exportData}
              variant="outline"
              className="rounded-2xl border-orange-200 dark:border-orange-700 hover:bg-orange-50 dark:hover:bg-orange-900/20 text-orange-700 dark:text-orange-300 bg-transparent"
            >
              <Download className="mr-2 h-4 w-4" />
              Export CSV
            </Button>
          </div>
        </header>

        <main className="flex flex-1 flex-col p-4 md:p-6">
          {/* Show warning and demo button if no sales data */}
          {data.length === 0 && (
            <div className="mb-6 p-4 bg-yellow-100 dark:bg-yellow-900/20 border border-yellow-300 dark:border-yellow-700 rounded-lg flex flex-col items-center">
              <p className="text-yellow-800 dark:text-yellow-200 font-semibold mb-2">
                No sales data found. Complete some orders or generate demo sales
                to see analytics.
              </p>
              <Button
                onClick={generateDemoSales}
                className="bg-orange-500 hover:bg-orange-600 text-white rounded-full px-6 py-2 mt-2"
              >
                Generate Demo Sales
              </Button>
            </div>
          )}
          {/* Clear sales data button and diagnostics */}
          <div className="mb-6 flex flex-wrap gap-4 items-center">
            <details className="ml-4">
              <summary className="cursor-pointer text-xs text-gray-500">
                Show Raw Sales Data (Diagnostics)
              </summary>
              <pre className="bg-gray-100 dark:bg-gray-800 p-2 rounded text-xs max-w-2xl overflow-x-auto mt-2">
                {JSON.stringify(data, null, 2)}
              </pre>
            </details>
          </div>
          {/* Filters */}
          <div className="mb-6 flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Input
                type="search"
                placeholder="Search orders, customers, items..."
                className="pl-8 rounded-2xl border-orange-200 dark:border-orange-700 focus:border-orange-500 dark:focus:border-orange-400 bg-white/50 dark:bg-gray-800/50"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <Select value={dateFilter} onValueChange={setDateFilter}>
              <SelectTrigger className="w-48 rounded-2xl border-orange-200 dark:border-orange-700 bg-white/50 dark:bg-gray-800/50">
                <SelectValue placeholder="Date range" />
              </SelectTrigger>
              <SelectContent className="rounded-2xl border-orange-200 dark:border-orange-700">
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="week">This Week</SelectItem>
                <SelectItem value="month">This Month</SelectItem>
                <SelectItem value="all">All Time</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Analytics Cards */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-6">
            <Card className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm border border-orange-200 dark:border-orange-700 rounded-3xl shadow-xl relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-green-100/20 via-emerald-100/20 to-teal-100/20 dark:from-green-900/20 dark:via-emerald-900/20 dark:to-teal-900/20"></div>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative z-10">
                <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">
                  Total Revenue
                </CardTitle>
                <DollarSign className="h-4 w-4 text-green-600 dark:text-green-400" />
              </CardHeader>
              <CardContent className="relative z-10">
                <div className="text-2xl font-bold text-green-700 dark:text-green-300">
                  ₵{analytics.totalRevenue.toFixed(2)}
                </div>
                <p className="text-xs text-green-600 dark:text-green-400">
                  From {analytics.totalOrders} orders
                </p>
              </CardContent>
            </Card>

            <Card className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm border border-orange-200 dark:border-orange-700 rounded-3xl shadow-xl relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-blue-100/20 via-indigo-100/20 to-purple-100/20 dark:from-blue-900/20 dark:via-indigo-900/20 dark:to-purple-900/20"></div>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative z-10">
                <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">
                  Total Orders
                </CardTitle>
                <ShoppingCart className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              </CardHeader>
              <CardContent className="relative z-10">
                <div className="text-2xl font-bold text-blue-700 dark:text-blue-300">
                  {analytics.totalOrders}
                </div>
                <p className="text-xs text-blue-600 dark:text-blue-400">
                  Orders processed
                </p>
              </CardContent>
            </Card>

            <Card className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm border border-orange-200 dark:border-orange-700 rounded-3xl shadow-xl relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-red-100/20 via-pink-100/20 to-rose-100/20 dark:from-red-900/20 dark:via-pink-900/20 dark:to-rose-900/20"></div>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative z-10">
                <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">
                  Refunds
                </CardTitle>
                <RotateCcw className="h-4 w-4 text-red-600 dark:text-red-400" />
              </CardHeader>
              <CardContent className="relative z-10">
                <div className="text-2xl font-bold text-red-700 dark:text-red-300">
                  ₵{analytics.totalRefunded.toFixed(2)}
                </div>
                <p className="text-xs text-red-600 dark:text-red-400">
                  {analytics.refundCount} refunded orders
                </p>
              </CardContent>
            </Card>

            <Card className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm border border-orange-200 dark:border-orange-700 rounded-3xl shadow-xl relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-amber-100/20 via-yellow-100/20 to-orange-100/20 dark:from-amber-900/20 dark:via-yellow-900/20 dark:to-orange-900/20"></div>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative z-10">
                <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">
                  Net Revenue
                </CardTitle>
                <TrendingUp className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              </CardHeader>
              <CardContent className="relative z-10">
                <div className="text-2xl font-bold text-amber-700 dark:text-amber-300">
                  ₵
                  {(analytics.totalRevenue - analytics.totalRefunded).toFixed(
                    2
                  )}
                </div>
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  After refunds
                </p>
              </CardContent>
            </Card>

            <Card className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm border border-orange-200 dark:border-orange-700 rounded-3xl shadow-xl relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-orange-100/20 via-amber-100/20 to-yellow-100/20 dark:from-orange-900/20 dark:via-amber-900/20 dark:to-yellow-900/20"></div>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative z-10">
                <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">
                  Average Order
                </CardTitle>
                <TrendingUp className="h-4 w-4 text-orange-600 dark:text-orange-400" />
              </CardHeader>
              <CardContent className="relative z-10">
                <div className="text-2xl font-bold text-orange-700 dark:text-orange-300">
                  ₵{analytics.averageOrderValue.toFixed(2)}
                </div>
                <p className="text-xs text-orange-600 dark:text-orange-400">
                  Per order value
                </p>
              </CardContent>
            </Card>

            <Card className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm border border-orange-200 dark:border-orange-700 rounded-3xl shadow-xl relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-purple-100/20 via-pink-100/20 to-rose-100/20 dark:from-purple-900/20 dark:via-pink-900/20 dark:to-rose-900/20"></div>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative z-10">
                <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">
                  Date Range
                </CardTitle>
                <Calendar className="h-4 w-4 text-purple-600 dark:text-purple-400" />
              </CardHeader>
              <CardContent className="relative z-10">
                <div className="text-2xl font-bold text-purple-700 dark:text-purple-300 capitalize">
                  {dateFilter}
                </div>
                <p className="text-xs text-purple-600 dark:text-purple-400">
                  Current filter
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Charts */}
          <SalesCharts data={filteredData} />

          <div className="grid gap-6 md:grid-cols-2">
            {/* Category Breakdown */}
            <Card className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm border border-orange-200 dark:border-orange-700 rounded-3xl shadow-xl relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-orange-100/20 via-amber-100/20 to-yellow-100/20 dark:from-orange-900/20 dark:via-amber-900/20 dark:to-yellow-900/20"></div>
              <CardHeader className="relative z-10">
                <CardTitle className="text-lg font-bold text-orange-800 dark:text-orange-200 flex items-center gap-2">
                  <BarChart3 className="h-5 w-5" />
                  Category Breakdown
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 relative z-10">
                {Object.entries(analytics.categoryBreakdown).map(
                  ([category, data]) => (
                    <div
                      key={category}
                      className="flex items-center justify-between p-3 bg-gradient-to-r from-white/60 to-orange-50/60 dark:from-gray-800/60 dark:to-orange-900/20 rounded-2xl border border-orange-200 dark:border-orange-700"
                    >
                      <div className="flex items-center gap-3">
                        <Badge
                          className={`rounded-full text-xs ${getCategoryColor(
                            category
                          )}`}
                        >
                          {category}
                        </Badge>
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                          {data.count} items
                        </span>
                      </div>
                      <span className="text-sm font-bold text-orange-700 dark:text-orange-300">
                        ₵{data.revenue.toFixed(2)}
                      </span>
                    </div>
                  )
                )}
              </CardContent>
            </Card>

            {/* Top Selling Items */}
            <Card className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm border border-orange-200 dark:border-orange-700 rounded-3xl shadow-xl relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-orange-100/20 via-amber-100/20 to-yellow-100/20 dark:from-orange-900/20 dark:via-amber-900/20 dark:to-yellow-900/20"></div>
              <CardHeader className="relative z-10">
                <CardTitle className="text-lg font-bold text-orange-800 dark:text-orange-200 flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  Top Selling Items
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 relative z-10">
                {analytics.topItems.map((item, index) => (
                  <div
                    key={item.name}
                    className="flex items-center justify-between p-3 bg-gradient-to-r from-white/60 to-orange-50/60 dark:from-gray-800/60 dark:to-orange-900/20 rounded-2xl border border-orange-200 dark:border-orange-700"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex items-center justify-center w-6 h-6 bg-gradient-to-r from-orange-500 to-amber-500 text-white text-xs font-bold rounded-full">
                        {index + 1}
                      </div>
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        {item.name}
                      </span>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-bold text-orange-700 dark:text-orange-300">
                        {item.quantity} sold
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        ₵{item.revenue.toFixed(2)}
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          {/* Recent Orders */}
          <Card className="mt-6 bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm border border-orange-200 dark:border-orange-700 rounded-3xl shadow-xl relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-orange-100/20 via-amber-100/20 to-yellow-100/20 dark:from-orange-900/20 dark:via-amber-900/20 dark:to-yellow-900/20"></div>
            <CardHeader className="relative z-10">
              <CardTitle className="text-lg font-bold text-orange-800 dark:text-orange-200 flex items-center gap-2">
                <ShoppingCart className="h-5 w-5" />
                Recent Orders
              </CardTitle>
            </CardHeader>
            <CardContent className="relative z-10">
              <ScrollArea className="h-[400px]">
                <div className="space-y-3">
                  {filteredData.slice(0, 20).map((order) => (
                    <div
                      key={order.id}
                      className="p-4 bg-gradient-to-r from-white/60 to-orange-50/60 dark:from-gray-800/60 dark:to-orange-900/20 rounded-2xl border border-orange-200 dark:border-orange-700"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-3">
                          <span className="font-bold text-orange-700 dark:text-orange-300">
                            {order.orderNumber}
                          </span>
                          <Badge
                            variant="outline"
                            className="rounded-full text-xs"
                          >
                            {order.orderType}
                          </Badge>
                        </div>
                        <div className="text-right">
                          <div className="font-bold text-green-700 dark:text-green-300">
                            ₵{order.total.toFixed(2)}
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            {new Date(order.date).toLocaleDateString()}
                          </div>
                        </div>
                      </div>
                      <div className="text-sm text-gray-600 dark:text-gray-400">
                        {order.customerName || `Table ${order.tableNumber}`} •{" "}
                        {order.paymentMethod}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                        {order.items.length} items:{" "}
                        {order.items.map((item) => item.name).join(", ")}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          {/* Payment Analytics Section */}
          <Card className="mt-6 bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm border border-blue-200 dark:border-blue-700 rounded-3xl shadow-xl relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-blue-100/20 via-indigo-100/20 to-purple-100/20 dark:from-blue-900/20 dark:via-indigo-900/20 dark:to-purple-900/20"></div>
            <CardHeader className="relative z-10">
              <CardTitle className="text-lg font-bold text-blue-800 dark:text-blue-200 flex items-center gap-2">
                <DollarSign className="h-5 w-5" />
                Payment Analytics
              </CardTitle>
            </CardHeader>
            <CardContent className="relative z-10 space-y-6">
              {/* Payment Method Breakdown */}
              <div>
                <h4 className="text-md font-semibold text-blue-700 dark:text-blue-300 mb-2">
                  Payment Methods
                </h4>
                <div className="flex flex-wrap gap-3">
                  {Object.entries(analytics.paymentMethods).length === 0 && (
                    <span className="text-gray-500 text-sm">
                      No payment data
                    </span>
                  )}
                  {Object.entries(analytics.paymentMethods).map(
                    ([method, count]) => (
                      <Badge
                        key={method}
                        className="rounded-full px-4 py-2 text-sm font-bold bg-blue-100 text-blue-800 border border-blue-300 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-700"
                      >
                        {method.toUpperCase()}: {count}
                      </Badge>
                    )
                  )}
                </div>
              </div>
              {/* Payment Transactions Table */}
              <div>
                <h4 className="text-md font-semibold text-blue-700 dark:text-blue-300 mb-2">
                  Recent Payment Transactions
                </h4>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm border-collapse">
                    <thead>
                      <tr className="bg-blue-50 dark:bg-blue-900/20">
                        <th className="px-3 py-2 text-left font-bold">
                          Order #
                        </th>
                        <th className="px-3 py-2 text-left font-bold">
                          Amount (₵)
                        </th>
                        <th className="px-3 py-2 text-left font-bold">
                          Method
                        </th>
                        <th className="px-3 py-2 text-left font-bold">Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredData.length === 0 && (
                        <tr>
                          <td
                            colSpan={4}
                            className="text-center text-gray-500 py-4"
                          >
                            No transactions
                          </td>
                        </tr>
                      )}
                      {filteredData.slice(0, 10).map((order) => (
                        <tr
                          key={order.id}
                          className="border-b border-blue-100 dark:border-blue-800"
                        >
                          <td className="px-3 py-2 font-mono text-blue-700 dark:text-blue-300">
                            {order.orderNumber}
                          </td>
                          <td className="px-3 py-2 text-blue-700 dark:text-blue-300 font-bold">
                            ₵{order.total.toFixed(2)}
                          </td>
                          <td className="px-3 py-2 text-blue-700 dark:text-blue-300">
                            {order.paymentMethod}
                          </td>
                          <td className="px-3 py-2 text-blue-700 dark:text-blue-300">
                            {new Date(order.date).toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </CardContent>
          </Card>
        </main>
      </div>
    </RoleGuard>
  );
}

export default dynamic(() => Promise.resolve(ReportsPage), { ssr: false });
