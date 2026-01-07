"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  ArrowLeft,
  CreditCard,
  DollarSign,
  TrendingUp,
  Calendar,
  Search,
  Banknote,
  Smartphone,
  Wallet,
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
import type { SalesData, OrderItem } from "@/lib/types";
import { RoleGuard } from "@/components/role-guard";
import { useLoading } from "@/components/loading-provider";

export default function PaymentsPage() {
  const [data, setData] = useState<SalesData[]>([]);
  const [dateFilter, setDateFilter] = useState<string>("today");
  const [paymentFilter, setPaymentFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const { showLoading, hideLoading } = useLoading();

  useEffect(() => {
    async function load(silent = false) {
      if (!silent) showLoading("Loading transactions...");
      try {
        const res = await fetch("/api/transactions");
        if (!res.ok) throw new Error("Failed to fetch transactions");
        const transactions = await res.json();

        // Map DB transactions to SalesData
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const salesData: SalesData[] = transactions.map((txn: any) => {
          const metadata = txn.metadata || {};
          const items: OrderItem[] = metadata.items || [];
          const orderNumber =
            metadata.orderNumber || txn.transaction_id || "Unknown";

          return {
            id: txn.transaction_id,
            orderNumber: orderNumber,
            orderId: metadata.orderId,
            date: txn.created_at,
            items: items,
            total:
              typeof txn.amount === "string"
                ? parseFloat(txn.amount)
                : txn.amount,
            orderType: metadata.orderType || "dine-in",
            tableNumber: metadata.tableNumber,
            customerName:
              metadata.customer_name || metadata.customerName || "Guest",
            paymentMethod: txn.payment_method || "cash",
            customerRefused: metadata.customerRefused,
          };
        });
        setData(salesData);
      } catch (error) {
        console.error("Error loading payments:", error);
        // Fallback to empty if DB fails
        setData([]);
      } finally {
        if (!silent) hideLoading();
      }
    }

    // Initial load
    load(false);

    // Poll for updates instead of storage event (since we are using DB now)
    const interval = setInterval(() => load(true), 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, [showLoading, hideLoading]);

  const filteredData = useMemo(() => {
    let filtered = [...data];

    // Apply date filter
    const today = new Date();
    const startOfToday = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate(),
    );
    const startOfWeek = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate() - today.getDay(),
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

    // Apply payment method filter
    if (paymentFilter !== "all") {
      filtered = filtered.filter(
        (item) => item.paymentMethod === paymentFilter,
      );
    }

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (item) =>
          item.orderNumber.toLowerCase().includes(query) ||
          item.customerName?.toLowerCase().includes(query) ||
          item.paymentMethod.toLowerCase().includes(query),
      );
    }

    return filtered;
  }, [data, dateFilter, paymentFilter, searchQuery]);

  const paymentAnalytics = useMemo(() => {
    const totalRevenue = filteredData.reduce(
      (sum, item) => sum + item.total,
      0,
    );
    const totalTransactions = filteredData.length;

    // Payment method breakdown
    const paymentBreakdown: Record<
      string,
      { count: number; revenue: number; percentage: number }
    > = {};
    filteredData.forEach((order) => {
      if (!paymentBreakdown[order.paymentMethod]) {
        paymentBreakdown[order.paymentMethod] = {
          count: 0,
          revenue: 0,
          percentage: 0,
        };
      }
      paymentBreakdown[order.paymentMethod].count += 1;
      paymentBreakdown[order.paymentMethod].revenue += order.total;
    });

    // Calculate percentages
    Object.keys(paymentBreakdown).forEach((method) => {
      paymentBreakdown[method].percentage =
        totalTransactions > 0
          ? (paymentBreakdown[method].count / totalTransactions) * 100
          : 0;
    });

    // Daily revenue trend (last 7 days)
    const dailyRevenue: Record<string, number> = {};
    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const date = new Date();
      date.setDate(date.getDate() - i);
      return date.toISOString().split("T")[0];
    }).reverse();

    last7Days.forEach((date) => {
      dailyRevenue[date] = 0;
    });

    filteredData.forEach((order) => {
      const orderDate = new Date(order.date).toISOString().split("T")[0];
      if (dailyRevenue.hasOwnProperty(orderDate)) {
        dailyRevenue[orderDate] += order.total;
      }
    });

    return {
      totalRevenue,
      totalTransactions,
      paymentBreakdown,
      dailyRevenue,
    };
  }, [filteredData]);

  const getPaymentMethodIcon = (method: string) => {
    switch (method.toLowerCase()) {
      case "cash":
        return <Banknote className="h-4 w-4" />;
      case "card":
        return <CreditCard className="h-4 w-4" />;
      case "mobile":
        return <Smartphone className="h-4 w-4" />;
      default:
        return <Wallet className="h-4 w-4" />;
    }
  };

  const getPaymentMethodColor = (method: string) => {
    switch (method.toLowerCase()) {
      case "cash":
        return "bg-green-100 text-green-800 border-green-200 dark:bg-green-900/20 dark:text-green-300 dark:border-green-700";
      case "card":
        return "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-700";
      case "mobile":
        return "bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-900/20 dark:text-purple-300 dark:border-purple-700";
      default:
        return "bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-900/20 dark:text-gray-300 dark:border-gray-700";
    }
  };

  return (
    <RoleGuard section="payments">
      <div className="flex min-h-screen w-full flex-col bg-gradient-to-br from-orange-50 via-amber-50 to-yellow-100 dark:from-orange-950 dark:via-amber-950 dark:to-yellow-950">
        <header className="sticky top-0 z-10 flex h-16 items-center gap-4 border-b bg-white/80 dark:bg-gray-900/80 backdrop-blur-md px-4 md:px-6 border-orange-200 dark:border-orange-700">
          <Link
            href="/"
            className="flex items-center gap-2 hover:opacity-80 transition-opacity"
          >
            <ArrowLeft className="h-5 w-5 text-orange-600 dark:text-orange-400" />
            <LogoDisplay size="sm" />
            <CreditCard className="h-6 w-6 text-orange-600 dark:text-orange-400" />
            <h1 className="text-lg font-semibold text-gray-800 dark:text-gray-200">
              Payment Analytics
            </h1>
          </Link>
        </header>

        <main className="flex flex-1 flex-col p-4 md:p-6">
          {/* Filters */}
          <div className="mb-6 flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search transactions..."
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
            <Select value={paymentFilter} onValueChange={setPaymentFilter}>
              <SelectTrigger className="w-48 rounded-2xl border-orange-200 dark:border-orange-700 bg-white/50 dark:bg-gray-800/50">
                <SelectValue placeholder="Payment method" />
              </SelectTrigger>
              <SelectContent className="rounded-2xl border-orange-200 dark:border-orange-700">
                <SelectItem value="all">All Methods</SelectItem>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="card">Card</SelectItem>
                <SelectItem value="mobile">Mobile</SelectItem>
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
                  ₵{paymentAnalytics.totalRevenue.toFixed(2)}
                </div>
                <p className="text-xs text-green-600 dark:text-green-400">
                  From {paymentAnalytics.totalTransactions} transactions
                </p>
              </CardContent>
            </Card>

            <Card className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm border border-orange-200 dark:border-orange-700 rounded-3xl shadow-xl relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-blue-100/20 via-indigo-100/20 to-purple-100/20 dark:from-blue-900/20 dark:via-indigo-900/20 dark:to-purple-900/20"></div>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative z-10">
                <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">
                  Transactions
                </CardTitle>
                <CreditCard className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              </CardHeader>
              <CardContent className="relative z-10">
                <div className="text-2xl font-bold text-blue-700 dark:text-blue-300">
                  {paymentAnalytics.totalTransactions}
                </div>
                <p className="text-xs text-blue-600 dark:text-blue-400">
                  Payment transactions
                </p>
              </CardContent>
            </Card>

            <Card className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm border border-orange-200 dark:border-orange-700 rounded-3xl shadow-xl relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-orange-100/20 via-amber-100/20 to-yellow-100/20 dark:from-orange-900/20 dark:via-amber-900/20 dark:to-yellow-900/20"></div>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative z-10">
                <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">
                  Avg Transaction
                </CardTitle>
                <TrendingUp className="h-4 w-4 text-orange-600 dark:text-orange-400" />
              </CardHeader>
              <CardContent className="relative z-10">
                <div className="text-2xl font-bold text-orange-700 dark:text-orange-300">
                  ₵
                  {paymentAnalytics.totalTransactions > 0
                    ? (
                        paymentAnalytics.totalRevenue /
                        paymentAnalytics.totalTransactions
                      ).toFixed(2)
                    : "0.00"}
                </div>
                <p className="text-xs text-orange-600 dark:text-orange-400">
                  Per transaction
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

          <div className="grid gap-6 md:grid-cols-2">
            {/* Payment Method Breakdown */}
            <Card className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm border border-orange-200 dark:border-orange-700 rounded-3xl shadow-xl relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-orange-100/20 via-amber-100/20 to-yellow-100/20 dark:from-orange-900/20 dark:via-amber-900/20 dark:to-yellow-900/20"></div>
              <CardHeader className="relative z-10">
                <CardTitle className="text-lg font-bold text-orange-800 dark:text-orange-200 flex items-center gap-2">
                  <CreditCard className="h-5 w-5" />
                  Payment Methods
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 relative z-10">
                {Object.entries(paymentAnalytics.paymentBreakdown).map(
                  ([method, data]) => (
                    <div key={method} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Badge
                            className={`rounded-full text-xs flex items-center gap-1 ${getPaymentMethodColor(
                              method,
                            )}`}
                          >
                            {getPaymentMethodIcon(method)}
                            {method.charAt(0).toUpperCase() + method.slice(1)}
                          </Badge>
                          <span className="text-sm text-gray-600 dark:text-gray-400">
                            {data.count} transactions
                          </span>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-bold text-orange-700 dark:text-orange-300">
                            ₵{data.revenue.toFixed(2)}
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            {data.percentage.toFixed(1)}%
                          </div>
                        </div>
                      </div>
                      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                        {(() => {
                          const percent = data.percentage;
                          return (
                            <div
                              className={`bg-gradient-to-r from-orange-500 via-amber-500 to-yellow-500 h-2 rounded-full transition-all duration-500 w-[${percent}%]`}
                            ></div>
                          );
                        })()}
                      </div>
                    </div>
                  ),
                )}
              </CardContent>
            </Card>

            {/* Daily Revenue Trend */}
            <Card className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm border border-orange-200 dark:border-orange-700 rounded-3xl shadow-xl relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-orange-100/20 via-amber-100/20 to-yellow-100/20 dark:from-orange-900/20 dark:via-amber-900/20 dark:to-yellow-900/20"></div>
              <CardHeader className="relative z-10">
                <CardTitle className="text-lg font-bold text-orange-800 dark:text-orange-200 flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  Daily Revenue (Last 7 Days)
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 relative z-10">
                {Object.entries(paymentAnalytics.dailyRevenue).map(
                  ([date, revenue]) => (
                    <div
                      key={date}
                      className="flex items-center justify-between p-3 bg-gradient-to-r from-white/60 to-orange-50/60 dark:from-gray-800/60 dark:to-orange-900/20 rounded-2xl border border-orange-200 dark:border-orange-700"
                    >
                      <div className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        {new Date(date).toLocaleDateString("en-US", {
                          weekday: "short",
                          month: "short",
                          day: "numeric",
                        })}
                      </div>
                      <div className="text-sm font-bold text-orange-700 dark:text-orange-300">
                        ₵{revenue.toFixed(2)}
                      </div>
                    </div>
                  ),
                )}
              </CardContent>
            </Card>
          </div>

          {/* Recent Transactions */}
          <Card className="mt-6 bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm border border-orange-200 dark:border-orange-700 rounded-3xl shadow-xl relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-orange-100/20 via-amber-100/20 to-yellow-100/20 dark:from-orange-900/20 dark:via-amber-900/20 dark:to-yellow-900/20"></div>
            <CardHeader className="relative z-10">
              <CardTitle className="text-lg font-bold text-orange-800 dark:text-orange-200 flex items-center gap-2">
                <CreditCard className="h-5 w-5" />
                Recent Transactions
              </CardTitle>
            </CardHeader>
            <CardContent className="relative z-10">
              <ScrollArea className="h-[400px]">
                <div className="space-y-3">
                  {filteredData.slice(0, 20).map((transaction) => (
                    <div
                      key={transaction.id}
                      className="p-4 bg-gradient-to-r from-white/60 to-orange-50/60 dark:from-gray-800/60 dark:to-orange-900/20 rounded-2xl border border-orange-200 dark:border-orange-700"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-3">
                          <span className="font-bold text-orange-700 dark:text-orange-300">
                            {transaction.orderNumber}
                          </span>
                          <Badge
                            className={`rounded-full text-xs flex items-center gap-1 ${getPaymentMethodColor(
                              transaction.paymentMethod,
                            )}`}
                          >
                            {getPaymentMethodIcon(transaction.paymentMethod)}
                            {transaction.paymentMethod}
                          </Badge>
                        </div>
                        <div className="text-right">
                          <div className="font-bold text-green-700 dark:text-green-300">
                            ₵{transaction.total.toFixed(2)}
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            {new Date(transaction.date).toLocaleString()}
                          </div>
                        </div>
                      </div>
                      <div className="text-sm text-gray-600 dark:text-gray-400">
                        {transaction.customerName ||
                          `Table ${transaction.tableNumber}`}{" "}
                        • {transaction.orderType}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </main>
      </div>
    </RoleGuard>
  );
}
