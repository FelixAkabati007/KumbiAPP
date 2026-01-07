"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ArrowLeft,
  Clock,
  RefreshCw,
  Sparkles,
  CheckCircle,
  PlayCircle,
  Package,
  AlertTriangle,
  Users,
  Utensils,
  Timer,
  StickyNote,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { LogoDisplay } from "@/components/logo-display";
import {
  OrderProvider,
  useOrders,
  type KitchenOrder,
} from "@/lib/order-context";
import type { OrderItem } from "@/lib/types";
import { useAuth } from "@/components/auth-provider";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { RoleGuard } from "@/components/role-guard";

type OrderStatus = KitchenOrder["status"] | OrderItem["status"];
type Priority = KitchenOrder["priority"];

function OrderDisplayContent() {
  const { orders, refreshOrders } = useOrders();
  const { user, isLoading } = useAuth();
  const [currentTime, setCurrentTime] = useState<Date | null>(null);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);

  useEffect(() => {
    const handleOrdersUpdate = () => refreshOrders();

    window.addEventListener("ordersUpdated", handleOrdersUpdate);

    // Initialize current time on client to avoid SSR time mismatch
    setCurrentTime(new Date());
    const interval = setInterval(() => {
      refreshOrders();
      setCurrentTime(new Date());
    }, 3000);

    return () => {
      window.removeEventListener("ordersUpdated", handleOrdersUpdate);
      clearInterval(interval);
    };
  }, [refreshOrders]);

  const activeOrders = useMemo(() => {
    const priorityOrder: Record<Priority, number> = {
      urgent: 4,
      high: 3,
      normal: 2,
      low: 1,
    };
    return orders
      .filter((order) => order.status !== "completed")
      .sort((a, b) => {
        const aPriority = priorityOrder[a.priority] || 0;
        const bPriority = priorityOrder[b.priority] || 0;
        if (aPriority !== bPriority) return bPriority - aPriority;
        return (
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        );
      });
  }, [orders]);

  const getStatusColor = (status: OrderStatus) => {
    const statusStyles: Record<Exclude<OrderStatus, undefined>, string> = {
      pending:
        "bg-gradient-to-r from-yellow-100 to-yellow-200 text-yellow-800 border-yellow-300 dark:from-yellow-900/30 dark:to-yellow-800/30 dark:text-yellow-300 dark:border-yellow-700",
      preparing:
        "bg-gradient-to-r from-blue-100 to-blue-200 text-blue-800 border-blue-300 dark:from-blue-900/30 dark:to-blue-800/30 dark:text-blue-300 dark:border-blue-700",
      "in-progress":
        "bg-gradient-to-r from-blue-100 to-blue-200 text-blue-800 border-blue-300 dark:from-blue-900/30 dark:to-blue-800/30 dark:text-blue-300 dark:border-blue-700",
      ready:
        "bg-gradient-to-r from-green-100 to-green-200 text-green-800 border-green-300 dark:from-green-900/30 dark:to-green-800/30 dark:text-green-300 dark:border-green-700",
      served:
        "bg-gradient-to-r from-gray-100 to-gray-200 text-gray-800 border-gray-300 dark:from-gray-900/30 dark:to-gray-800/30 dark:text-gray-300 dark:border-gray-700",
      completed:
        "bg-gradient-to-r from-gray-100 to-gray-200 text-gray-800 border-gray-300 dark:from-gray-900/30 dark:to-gray-800/30 dark:text-gray-300 dark:border-gray-700",
    };
    // fallback to 'pending' if status is undefined or not a valid key
    return status
      ? (statusStyles[status as Exclude<OrderStatus, undefined>] ??
          statusStyles["pending"])
      : statusStyles["pending"];
  };

  const getPriorityColor = (priority: Priority) => {
    switch (priority) {
      case "urgent":
        return "bg-gradient-to-r from-red-500 to-red-600 text-white shadow-lg animate-pulse";
      case "high":
        return "bg-gradient-to-r from-orange-500 to-orange-600 text-white shadow-md";
      case "normal":
        return "bg-gradient-to-r from-blue-500 to-blue-600 text-white";
      case "low":
      default:
        return "bg-gradient-to-r from-gray-500 to-gray-600 text-white";
    }
  };

  const getStatusIcon = (status: OrderStatus) => {
    switch (status) {
      case "pending":
        return <Clock className="h-4 w-4" aria-label="Pending" />;
      case "preparing":
      case "in-progress":
        return <PlayCircle className="h-4 w-4" aria-label="Preparing" />;
      case "ready":
        return <CheckCircle className="h-4 w-4" aria-label="Ready" />;
      case "served":
      case "completed":
        return <Package className="h-4 w-4" aria-label="Served" />;
      default:
        return <Clock className="h-4 w-4" aria-label="Unknown" />;
    }
  };

  const getElapsedTime = (createdAt: string | Date) => {
    if (!currentTime) return 0;
    const created = new Date(createdAt);
    if (isNaN(created.getTime())) return 0;
    return Math.max(
      0,
      Math.floor((currentTime.getTime() - created.getTime()) / 60000)
    );
  };

  const getOrderProgress = (order: KitchenOrder): number => {
    const total = order.items.length;
    const completed = order.items.filter(
      (item) => item.status && ["ready", "served"].includes(item.status)
    ).length;
    return total ? Math.round((completed / total) * 100) : 0;
  };

  // Reset handler
  const handleResetKitchen = () => {
    localStorage.removeItem("kitchen_orders");
    refreshOrders();
    setResetDialogOpen(false);
    toast.success("Kitchen Display has been reset.");
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
          <Users className="h-6 w-6 text-orange-600 dark:text-orange-400" />
          <h1 className="text-lg font-semibold text-gray-800 dark:text-gray-200">
            Order Display Board
          </h1>
        </Link>
        <div className="ml-auto flex items-center gap-4">
          <div className="flex items-center gap-2 px-3 py-1 bg-gradient-to-r from-orange-50 via-amber-50 to-yellow-50 dark:from-orange-900/30 dark:via-amber-900/30 dark:to-yellow-900/30 rounded-full border border-orange-200 dark:border-orange-700">
            <Sparkles className="h-4 w-4 text-orange-600 dark:text-orange-400" />
            <span className="text-sm font-medium text-orange-700 dark:text-orange-300">
              {activeOrders.length} Active Orders
            </span>
          </div>
          <div className="text-sm font-medium text-gray-600 dark:text-gray-400">
            {currentTime ? currentTime.toLocaleTimeString() : "--:--:--"}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={refreshOrders}
            aria-label="Refresh Orders"
            className="border-orange-200 dark:border-orange-700 hover:bg-orange-50 dark:hover:bg-orange-900/20 text-orange-700 dark:text-orange-300 rounded-2xl bg-transparent"
          >
            <RefreshCw className="h-4 w-4" aria-label="Refresh Icon" />
          </Button>
          {/* Reset Kitchen Display button for admin/manager only */}
          {!isLoading &&
            user &&
            (user.role === "admin" || user.role === "manager") && (
              <>
                <Button
                  variant="destructive"
                  size="sm"
                  className="rounded-2xl ml-2"
                  onClick={() => setResetDialogOpen(true)}
                >
                  Reset Kitchen Display
                </Button>
                <Dialog
                  open={resetDialogOpen}
                  onOpenChange={setResetDialogOpen}
                >
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Reset Kitchen Display?</DialogTitle>
                      <DialogDescription>
                        This will clear all active kitchen orders. This action
                        cannot be undone.
                      </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                      <Button
                        variant="outline"
                        onClick={() => setResetDialogOpen(false)}
                      >
                        Cancel
                      </Button>
                      <Button
                        variant="destructive"
                        onClick={handleResetKitchen}
                      >
                        Reset
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </>
            )}
        </div>
      </header>

      <main className="flex flex-1 flex-col p-4 md:p-6">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-orange-800 dark:text-orange-200 mb-2">
            Live Order Board
          </h2>
          <p className="text-orange-600 dark:text-orange-400">
            Real-time order status updates from the kitchen
          </p>
        </div>

        <ScrollArea className="h-[calc(100vh-200px)]">
          {activeOrders.length > 0 ? (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {activeOrders.map((order) => (
                <Card
                  key={order.id}
                  className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border-2 border-orange-200 dark:border-orange-700 rounded-3xl shadow-2xl relative overflow-hidden hover:scale-105 transition-all duration-500 hover:shadow-3xl"
                >
                  {/* Animated background gradient */}
                  <div className="absolute inset-0 bg-gradient-to-br from-orange-100/30 via-amber-100/30 to-yellow-100/30 dark:from-orange-900/30 dark:via-amber-900/30 dark:to-yellow-900/30 animate-pulse"></div>

                  {/* Priority indicator stripe */}
                  <div
                    className={`absolute top-0 left-0 right-0 h-2 ${getPriorityColor(
                      order.priority
                    )}`}
                  ></div>

                  <CardHeader className="pb-3 relative z-10">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-xl font-bold text-orange-800 dark:text-orange-200 flex items-center gap-2">
                        <Utensils className="h-5 w-5" />
                        {order.orderNumber}
                      </CardTitle>
                      <div className="flex items-center gap-2">
                        <Badge
                          className={`rounded-full text-xs font-bold ${getPriorityColor(
                            order.priority
                          )}`}
                        >
                          {order.priority.toUpperCase()}
                        </Badge>
                        {order.priority === "urgent" && (
                          <AlertTriangle className="h-5 w-5 text-red-500 animate-bounce" />
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-sm mt-2">
                      <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300 font-medium">
                        <Users className="h-4 w-4" />
                        {order.orderType === "dine-in"
                          ? `Table ${order.tableNumber}`
                          : order.customerName}
                      </div>
                      <div className="flex items-center gap-1 text-orange-600 dark:text-orange-400 font-medium">
                        <Timer className="h-4 w-4" />
                        {getElapsedTime(order.createdAt)}min ago
                      </div>
                    </div>

                    {/* Order Progress Bar */}
                    <div className="mt-3">
                      {(() => {
                        const percent = getOrderProgress(order);
                        return (
                          <>
                            <div className="flex justify-between items-center mb-1">
                              <span className="text-xs font-medium text-gray-600 dark:text-gray-400">
                                Progress
                              </span>
                              <span className="text-xs font-bold text-orange-600 dark:text-orange-400">
                                {percent}%
                              </span>
                            </div>
                            <div
                              className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2"
                              role="progressbar"
                              aria-valuenow={isNaN(percent) ? 0 : percent}
                              aria-valuemin={0}
                              aria-valuemax={100}
                              aria-label="Order progress"
                            >
                              <div
                                className="bg-gradient-to-r from-orange-500 via-amber-500 to-yellow-500 h-2 rounded-full transition-all duration-500"
                                style={{ width: `${percent}%` }}
                              />
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-4 relative z-10">
                    {/* Order Status Badge */}
                    <div className="flex justify-center">
                      <Badge
                        className={`rounded-full px-4 py-2 text-sm font-bold ${getStatusColor(
                          order.status
                        )} flex items-center gap-2 shadow-lg`}
                      >
                        {getStatusIcon(order.status)}
                        {order.status
                          ? order.status.replace("-", " ").toUpperCase()
                          : "PENDING"}
                      </Badge>
                    </div>

                    {/* Order Items Grid */}
                    <div className="space-y-3">
                      <h4 className="text-sm font-bold text-orange-700 dark:text-orange-300 flex items-center gap-2 border-b border-orange-200 dark:border-orange-700 pb-1">
                        <Package className="h-4 w-4" />
                        Items ({order.items.length})
                      </h4>
                      <div className="grid gap-2">
                        {order.items.map((item) => (
                          <div
                            key={item.id}
                            className="p-3 bg-gradient-to-r from-white/60 via-orange-50/60 to-amber-50/60 dark:from-gray-800/60 dark:via-orange-900/20 dark:to-amber-900/20 rounded-2xl border border-orange-200 dark:border-orange-700 backdrop-blur-sm"
                          >
                            <div className="flex justify-between items-start mb-2">
                              <div className="flex-1">
                                <p className="font-semibold text-sm text-gray-800 dark:text-gray-200">
                                  {item.name}
                                </p>
                                <div className="flex items-center gap-3 mt-1">
                                  <span className="text-xs text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded-full">
                                    Qty: {item.quantity}
                                  </span>
                                  {item.prepTime !== undefined &&
                                    item.prepTime > 0 && (
                                      <div className="flex items-center gap-1 text-xs text-orange-600 dark:text-orange-400">
                                        <Timer className="h-3 w-3" />
                                        {item.prepTime}min
                                      </div>
                                    )}
                                </div>
                                {item.notes && (
                                  <div className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 mt-1 bg-blue-50 dark:bg-blue-900/20 px-2 py-1 rounded-full">
                                    <StickyNote className="h-3 w-3" />
                                    {item.notes}
                                  </div>
                                )}
                              </div>
                            </div>

                            <div className="flex justify-center">
                              <Badge
                                className={`rounded-full text-xs font-bold ${getStatusColor(
                                  item.status
                                )} flex items-center gap-1 px-3 py-1`}
                              >
                                {getStatusIcon(item.status)}
                                {(item.status || "pending").toUpperCase()}
                              </Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Chef Notes */}
                    {order.chefNotes && (
                      <div className="p-3 bg-gradient-to-r from-blue-50 via-indigo-50 to-purple-50 dark:from-blue-900/30 dark:via-indigo-900/30 dark:to-purple-900/30 rounded-2xl border border-blue-200 dark:border-blue-700">
                        <p className="text-xs font-bold text-blue-700 dark:text-blue-300 mb-1 flex items-center gap-1">
                          <StickyNote className="h-3 w-3" />
                          Chef Notes:
                        </p>
                        <p className="text-sm text-blue-600 dark:text-blue-400 font-medium">
                          {order.chefNotes}
                        </p>
                      </div>
                    )}

                    {/* Estimated Time */}
                    {order.estimatedTime && order.estimatedTime > 0 && (
                      <div className="flex justify-center">
                        <div className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-orange-100 to-amber-100 dark:from-orange-900/30 dark:to-amber-900/30 rounded-full border border-orange-200 dark:border-orange-700">
                          <Clock className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                          <span className="text-sm font-bold text-orange-700 dark:text-orange-300">
                            Est. {order.estimatedTime} min remaining
                          </span>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-96">
              <div className="p-8 bg-gradient-to-br from-orange-100 via-amber-100 to-yellow-100 dark:from-orange-900/30 dark:via-amber-900/30 dark:to-yellow-900/30 rounded-full mb-6 shadow-xl">
                <Sparkles className="h-16 w-16 text-orange-600 dark:text-orange-400 animate-pulse" />
              </div>
              <h3 className="text-2xl font-bold text-orange-800 dark:text-orange-200 mb-2">
                All Caught Up!
              </h3>
              <p className="text-lg text-orange-600 dark:text-orange-400 text-center max-w-md">
                No active orders at the moment. New orders will appear here in
                real-time.
              </p>
            </div>
          )}
        </ScrollArea>
      </main>
    </div>
  );
}

export default function OrderDisplayPage() {
  return (
    <OrderProvider>
      <RoleGuard section="orderBoard">
        <OrderDisplayContent />
      </RoleGuard>
    </OrderProvider>
  );
}

export const dynamic = "force-dynamic";
