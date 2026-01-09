"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SyncSelect } from "@/components/ui/sync-select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ArrowLeft,
  ChefHat,
  Filter,
  RefreshCw,
  Search,
  SortAsc,
  SortDesc,
  Users,
  Utensils,
  CheckCircle,
  Circle,
  Play,
  Clock,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { LogoDisplay } from "@/components/logo-display";
import {
  OrderProvider,
  useOrders,
  type KitchenOrder,
} from "@/lib/order-context";
import type { OrderItem } from "@/lib/types";
import { playNotificationSound } from "@/lib/notifications";
import { RoleGuard } from "@/components/role-guard";

function WaitTimer({ createdAt }: { createdAt: string }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const update = () => {
      const start = new Date(createdAt).getTime();
      const now = new Date().getTime();
      setElapsed(Math.floor((now - start) / 60000));
    };
    update();
    const interval = setInterval(update, 60000);
    return () => clearInterval(interval);
  }, [createdAt]);

  let colorClass =
    "text-green-600 bg-green-100 border-green-200 dark:bg-green-900/20 dark:border-green-800 dark:text-green-400";
  if (elapsed > 20)
    colorClass =
      "text-red-600 bg-red-100 border-red-200 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400";
  else if (elapsed > 10)
    colorClass =
      "text-yellow-600 bg-yellow-100 border-yellow-200 dark:bg-yellow-900/20 dark:border-yellow-800 dark:text-yellow-400";

  return (
    <Badge
      variant="outline"
      className={`${colorClass} ml-auto flex items-center gap-1`}
    >
      <Clock className="h-3 w-3" />
      {elapsed}m
    </Badge>
  );
}

function KitchenContent() {
  const { toast } = useToast();
  const { orders, updateOrderItemStatus, getOrdersByClient, refreshOrders } =
    useOrders();

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [sortBy, setSortBy] = useState("createdAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");

  const [previousOrderCount, setPreviousOrderCount] = useState(0);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Real-time updates
  useEffect(() => {
    const handleOrdersUpdate = () => {
      refreshOrders();
    };

    window.addEventListener("ordersUpdated", handleOrdersUpdate);
    return () =>
      window.removeEventListener("ordersUpdated", handleOrdersUpdate);
  }, [refreshOrders]);

  // Handle manual refresh
  const handleRefresh = async () => {
    if (isRefreshing) return;

    setIsRefreshing(true);
    try {
      const success = await refreshOrders();
      if (success) {
        toast({
          title: "Kitchen Updated",
          description: "Order display synchronized successfully",
          duration: 2000,
        });
      } else {
        throw new Error("Failed to fetch orders");
      }
    } catch (error) {
      console.error("Refresh failed:", error);
      toast({
        title: "Refresh Failed",
        description: "Could not synchronize orders. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      refreshOrders();
    }, 30000);

    return () => clearInterval(interval);
  }, [refreshOrders]);

  // Detect new orders and play notifications
  useEffect(() => {
    if (orders.length > previousOrderCount && previousOrderCount > 0) {
      const newOrders = orders.length - previousOrderCount;
      playNotificationSound();
      toast({
        title: "New Order(s) Received",
        description: `${newOrders} new order${
          newOrders > 1 ? "s" : ""
        } added to kitchen`,
      });
    }
    setPreviousOrderCount(orders.length);
  }, [orders.length, previousOrderCount, toast]);

  // Filter and sort orders
  const filteredAndSortedOrders = useMemo(() => {
    let filtered = orders;

    // Apply search filter
    if (searchQuery) {
      filtered = filtered.filter(
        (order) =>
          order.orderNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
          order.customerName
            ?.toLowerCase()
            .includes(searchQuery.toLowerCase()) ||
          order.tableNumber
            ?.toLowerCase()
            .includes(searchQuery.toLowerCase()) ||
          order.items.some((item) =>
            item.name.toLowerCase().includes(searchQuery.toLowerCase())
          )
      );
    }

    // Apply status filter
    if (statusFilter !== "all") {
      filtered = filtered.filter((order) => order.status === statusFilter);
    }

    // Apply priority filter
    if (priorityFilter !== "all") {
      filtered = filtered.filter((order) => order.priority === priorityFilter);
    }

    // Sort orders
    filtered.sort((a, b) => {
      let aValue: number | string;
      let bValue: number | string;

      switch (sortBy) {
        case "createdAt": {
          aValue = new Date(a.createdAt).getTime();
          bValue = new Date(b.createdAt).getTime();
          break;
        }
        case "priority": {
          const priorityOrder: Record<KitchenOrder["priority"], number> = {
            urgent: 4,
            high: 3,
            normal: 2,
            low: 1,
          };
          aValue = priorityOrder[a.priority];
          bValue = priorityOrder[b.priority];
          break;
        }
        case "estimatedTime": {
          aValue = a.estimatedTime ?? 0;
          bValue = b.estimatedTime ?? 0;
          break;
        }
        default: {
          const aRaw = a[sortBy as keyof KitchenOrder];
          const bRaw = b[sortBy as keyof KitchenOrder];
          aValue = typeof aRaw === "number" ? aRaw : String(aRaw ?? "");
          bValue = typeof bRaw === "number" ? bRaw : String(bRaw ?? "");
        }
      }

      let result: number;
      if (typeof aValue === "number" && typeof bValue === "number") {
        result = aValue - bValue;
      } else {
        result = String(aValue).localeCompare(String(bValue));
      }

      return sortOrder === "asc" ? result : -result;
    });

    return filtered;
  }, [orders, searchQuery, statusFilter, priorityFilter, sortBy, sortOrder]);

  // Get client statistics
  const clientStats = useMemo(() => {
    const clientGroups = getOrdersByClient();
    const stats = Object.entries(clientGroups).map(
      ([client, clientOrders]) => ({
        client,
        totalOrders: clientOrders.length,
        pendingOrders: clientOrders.filter(
          (order) => order.status === "pending"
        ).length,
        inProgressOrders: clientOrders.filter(
          (order) => order.status === "in-progress"
        ).length,
        readyOrders: clientOrders.filter((order) => order.status === "ready")
          .length,
      })
    );

    return stats.sort((a, b) => b.totalOrders - a.totalOrders);
  }, [getOrdersByClient]);

  const statusCounts = useMemo(
    () => ({
      pending: orders.filter((o) => o.status === "pending").length,
      "in-progress": orders.filter((o) => o.status === "in-progress").length,
      ready: orders.filter((o) => o.status === "ready").length,
      completed: orders.filter((o) => o.status === "completed").length,
      all: orders.length,
    }),
    [orders]
  );

  const handleItemStatusChange = async (
    orderId: string,
    itemId: string,
    status: OrderItem["status"]
  ) => {
    // Play sound for specific statuses immediately (optimistic)
    if (status === "ready" || status === "served") {
      playNotificationSound();
    }

    // Call update (optimistic UI update happens inside)
    const success = await updateOrderItemStatus(orderId, itemId, status);

    if (success) {
      // Toast notification on success
      toast({
        title: "Item Status Updated",
        description: `Item status changed to ${status}`,
      });
    } else {
      // Error notification on failure
      toast({
        title: "Update Failed",
        description: "Failed to sync status with database. Changes reverted.",
        variant: "destructive",
      });
    }

    return success;
  };

  const getStatusIcon = (status: OrderItem["status"]) => {
    switch (status) {
      case "pending":
        return <Circle className="h-4 w-4 text-orange-500" />;
      case "preparing":
        return <Play className="h-4 w-4 text-blue-500" />;
      case "ready":
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case "served":
        return <CheckCircle className="h-4 w-4 text-gray-500" />;
      default:
        return <Circle className="h-4 w-4 text-gray-400" />;
    }
  };

  const getStatusColor = (status: OrderItem["status"]) => {
    switch (status) {
      case "pending":
        return "bg-orange-100 text-orange-800 border-orange-200";
      case "preparing":
        return "bg-blue-100 text-blue-800 border-blue-200";
      case "ready":
        return "bg-green-100 text-green-800 border-green-200";
      case "served":
        return "bg-gray-100 text-gray-800 border-gray-200";
      default:
        return "bg-gray-100 text-gray-800 border-gray-200";
    }
  };

  // Enhanced reset handler for Kitchen Display with data preservation and analytics
  const handleResetKitchen = async () => {
    try {
      toast({
        title: "Not Supported",
        description:
          "Kitchen reset is disabled in Database mode. Please complete orders individually.",
        variant: "destructive",
      });
      setResetDialogOpen(false);
    } catch (error) {
      console.error("Failed to reset kitchen:", error);
      toast({
        title: "Reset Failed",
        description: "An error occurred while resetting the kitchen display",
        variant: "destructive",
      });
    }
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
          <ChefHat className="h-6 w-6 text-orange-600 dark:text-orange-400" />
          <h1 className="text-lg font-semibold text-gray-800 dark:text-gray-200">
            Kitchen Display
          </h1>
        </Link>
        <div className="ml-auto flex items-center gap-2">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Badge
                variant="outline"
                className="text-xs border-orange-200 dark:border-orange-700 text-orange-600 dark:text-orange-400"
              >
                {orders.filter((o) => o.status === "pending").length} Pending
              </Badge>
              <Badge
                variant="outline"
                className="text-xs border-blue-200 dark:border-blue-700 text-blue-600 dark:text-blue-400"
              >
                {orders.filter((o) => o.status === "in-progress").length} In
                Progress
              </Badge>
              <Badge
                variant="outline"
                className="text-xs border-green-200 dark:border-green-700 text-green-600 dark:text-green-400"
              >
                {orders.filter((o) => o.status === "ready").length} Ready
              </Badge>
            </div>
          </div>
          <Badge
            variant="outline"
            className="text-sm border-orange-200 dark:border-orange-700 text-orange-700 dark:text-orange-300"
          >
            {filteredAndSortedOrders.length} Orders
          </Badge>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="border-orange-200 dark:border-orange-700 hover:bg-orange-50 dark:hover:bg-orange-900/20 text-orange-700 dark:text-orange-300 rounded-2xl bg-transparent"
          >
            <RefreshCw
              className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`}
            />
            <span className="sr-only">Refresh Orders</span>
          </Button>
          <Dialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
            <DialogContent className="sm:max-w-md bg-white/90 dark:bg-gray-800/90 backdrop-blur-md border border-orange-200 dark:border-orange-700 rounded-3xl">
              <DialogHeader>
                <DialogTitle>Reset Kitchen Display?</DialogTitle>
                <DialogDescription className="space-y-2">
                  <p>This will:</p>
                  <ul className="list-disc list-inside text-sm">
                    <li>Clear all active kitchen orders</li>
                    <li>Reset order counters</li>
                    <li>Archive current orders for history</li>
                    <li>Synchronize all kitchen displays</li>
                  </ul>
                  <p className="mt-2 text-sm text-orange-600 dark:text-orange-400">
                    Order history will be preserved and can be accessed in
                    reports.
                  </p>
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setResetDialogOpen(false)}
                  className="rounded-2xl border-orange-200 dark:border-orange-700"
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleResetKitchen}
                  className="rounded-2xl"
                >
                  Reset Kitchen
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Client Statistics Sidebar */}
        <div className="w-80 border-r border-orange-200 dark:border-orange-700 bg-gradient-to-b from-orange-50/30 via-amber-50/30 to-yellow-50/30 dark:from-orange-900/10 dark:via-amber-900/10 dark:to-yellow-900/10">
          <div className="p-4 border-b border-orange-200 dark:border-orange-700">
            <h2 className="font-semibold text-lg mb-2 text-orange-800 dark:text-orange-200 flex items-center gap-2">
              <Users className="h-5 w-5" />
              Client Overview
            </h2>
            <p className="text-sm text-muted-foreground">
              Orders grouped by client
            </p>
          </div>

          <ScrollArea className="flex-1 p-4">
            <div className="space-y-3">
              {clientStats.map((stat) => (
                <Card
                  key={stat.client}
                  className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm border border-orange-200 dark:border-orange-700 rounded-2xl shadow-sm relative overflow-hidden"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-orange-50/30 via-amber-50/30 to-yellow-50/30 dark:from-orange-900/10 dark:via-amber-900/10 dark:to-yellow-900/10"></div>
                  <CardHeader className="p-3 relative z-10">
                    <CardTitle className="text-sm font-medium">
                      {stat.client}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-3 pt-0 relative z-10">
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Total:</span>
                        <span className="font-medium">{stat.totalOrders}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-orange-600">Pending:</span>
                        <span className="font-medium text-orange-600">
                          {stat.pendingOrders}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-blue-600">In Progress:</span>
                        <span className="font-medium text-blue-600">
                          {stat.inProgressOrders}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-green-600">Ready:</span>
                        <span className="font-medium text-green-600">
                          {stat.readyOrders}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}

              {clientStats.length === 0 && (
                <div className="text-center py-8">
                  <p className="text-muted-foreground">No active orders</p>
                </div>
              )}
            </div>
          </ScrollArea>
        </div>

        {/* Main Orders Section */}
        <div className="flex flex-col flex-1">
          {/* Filters and Search */}
          <div className="p-4 border-b border-orange-200 dark:border-orange-700 bg-gradient-to-r from-orange-50/50 via-amber-50/50 to-yellow-50/50 dark:from-orange-900/20 dark:via-amber-900/20 dark:to-yellow-900/20">
            <div className="flex flex-wrap items-center gap-4">
              <div className="relative flex-1 min-w-64">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  type="search"
                  placeholder="Search orders, items, or customers..."
                  className="pl-8 rounded-2xl border-orange-200 dark:border-orange-700 focus:border-orange-500 dark:focus:border-orange-400 bg-white/50 dark:bg-gray-800/50"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-48 rounded-2xl border-orange-200 dark:border-orange-700 focus:border-orange-500 dark:focus:border-orange-400 bg-white/50 dark:bg-gray-800/50">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent className="rounded-2xl border-orange-200 dark:border-orange-700">
                    <SelectItem value="all">
                      <div className="flex items-center gap-2 w-full">
                        <span>All Status</span>
                        <Badge
                          variant="secondary"
                          className="ml-2 text-xs h-5 px-1.5 min-w-[1.5rem] justify-center"
                        >
                          {statusCounts.all}
                        </Badge>
                      </div>
                    </SelectItem>
                    <SelectItem value="pending">
                      <div className="flex items-center gap-2 w-full">
                        <Circle className="h-2 w-2 text-orange-500 fill-orange-500" />
                        <span>Pending</span>
                        <Badge
                          variant="secondary"
                          className="ml-2 text-xs h-5 px-1.5 min-w-[1.5rem] justify-center bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400"
                        >
                          {statusCounts.pending}
                        </Badge>
                      </div>
                    </SelectItem>
                    <SelectItem value="in-progress">
                      <div className="flex items-center gap-2 w-full">
                        <Play className="h-2 w-2 text-blue-500 fill-blue-500" />
                        <span>In Progress</span>
                        <Badge
                          variant="secondary"
                          className="ml-2 text-xs h-5 px-1.5 min-w-[1.5rem] justify-center bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                        >
                          {statusCounts["in-progress"]}
                        </Badge>
                      </div>
                    </SelectItem>
                    <SelectItem value="ready">
                      <div className="flex items-center gap-2 w-full">
                        <CheckCircle className="h-2 w-2 text-green-500 fill-green-500" />
                        <span>Ready</span>
                        <Badge
                          variant="secondary"
                          className="ml-2 text-xs h-5 px-1.5 min-w-[1.5rem] justify-center bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                        >
                          {statusCounts.ready}
                        </Badge>
                      </div>
                    </SelectItem>
                    <SelectItem value="completed">
                      <div className="flex items-center gap-2 w-full">
                        <CheckCircle className="h-2 w-2 text-gray-500" />
                        <span>Completed</span>
                        <Badge
                          variant="secondary"
                          className="ml-2 text-xs h-5 px-1.5 min-w-[1.5rem] justify-center bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400"
                        >
                          {statusCounts.completed}
                        </Badge>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>

                <Select
                  value={priorityFilter}
                  onValueChange={setPriorityFilter}
                >
                  <SelectTrigger className="w-32 rounded-2xl border-orange-200 dark:border-orange-700 focus:border-orange-500 dark:focus:border-orange-400 bg-white/50 dark:bg-gray-800/50">
                    <SelectValue placeholder="Priority" />
                  </SelectTrigger>
                  <SelectContent className="rounded-2xl border-orange-200 dark:border-orange-700">
                    <SelectItem value="all">All Priority</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={sortBy} onValueChange={setSortBy}>
                  <SelectTrigger className="w-40 rounded-2xl border-orange-200 dark:border-orange-700 focus:border-orange-500 dark:focus:border-orange-400 bg-white/50 dark:bg-gray-800/50">
                    <SelectValue placeholder="Sort by" />
                  </SelectTrigger>
                  <SelectContent className="rounded-2xl border-orange-200 dark:border-orange-700">
                    <SelectItem value="createdAt">Order Time</SelectItem>
                    <SelectItem value="priority">Priority</SelectItem>
                    <SelectItem value="estimatedTime">Est. Time</SelectItem>
                  </SelectContent>
                </Select>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setSortOrder(sortOrder === "asc" ? "desc" : "asc")
                  }
                  className="rounded-2xl border-orange-200 dark:border-orange-700 hover:bg-orange-50 dark:hover:bg-orange-900/20 text-orange-700 dark:text-orange-300 bg-transparent"
                >
                  {sortOrder === "asc" ? (
                    <SortAsc className="h-4 w-4" />
                  ) : (
                    <SortDesc className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          </div>

          {/* Orders List */}
          <ScrollArea className="flex-1 p-4">
            <div className="space-y-4">
              {filteredAndSortedOrders.map((order) => (
                <Card
                  key={order.id}
                  className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm border border-orange-200 dark:border-orange-700 rounded-3xl shadow-sm relative overflow-hidden"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-orange-50/30 via-amber-50/30 to-yellow-50/30 dark:from-orange-900/10 dark:via-amber-900/10 dark:to-yellow-900/10"></div>

                  <CardContent className="p-4 relative z-10">
                    <div className="flex items-center justify-between mb-4 pb-2 border-b border-orange-100 dark:border-orange-800">
                      <div>
                        <h3 className="font-bold text-lg text-orange-900 dark:text-orange-100">
                          Order #{order.orderNumber}
                        </h3>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          {order.tableNumber && (
                            <span className="font-medium text-orange-700 dark:text-orange-300">
                              Table {order.tableNumber}
                            </span>
                          )}
                          <span>•</span>
                          <span>
                            {new Date(order.createdAt).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {order.priority === "urgent" && (
                          <Badge
                            variant="destructive"
                            className="animate-pulse"
                          >
                            Urgent
                          </Badge>
                        )}
                        {order.priority === "high" && (
                          <Badge className="bg-orange-500 hover:bg-orange-600">
                            High
                          </Badge>
                        )}
                        <WaitTimer createdAt={order.createdAt} />
                      </div>
                    </div>

                    <div className="space-y-3">
                      {order.items.map((item) => (
                        <div
                          key={`${order.id}-${item.id}`}
                          className="flex items-center justify-between p-3 bg-white/50 dark:bg-gray-800/50 rounded-2xl border border-orange-100 dark:border-orange-800"
                        >
                          <div className="flex items-center gap-3">
                            {getStatusIcon(item.status)}
                            <div>
                              <p className="font-medium text-sm">
                                {item.quantity}x {item.name}
                              </p>
                              {item.notes && (
                                <p className="text-xs text-muted-foreground italic">
                                  {item.notes}
                                </p>
                              )}
                              {item.prepTime && (
                                <p className="text-xs text-orange-600 dark:text-orange-400">
                                  ~{item.prepTime} min prep time
                                </p>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <Badge
                              className={`rounded-full text-xs ${getStatusColor(
                                item.status
                              )}`}
                            >
                              {item.status || "pending"}
                            </Badge>
                            <SyncSelect
                              value={item.status || "pending"}
                              onValueChange={(value) =>
                                handleItemStatusChange(
                                  order.id,
                                  item.id,
                                  value as OrderItem["status"]
                                )
                              }
                              options={[
                                { value: "pending", label: "Pending" },
                                { value: "preparing", label: "Preparing" },
                                { value: "ready", label: "Ready" },
                                { value: "served", label: "Served" },
                              ]}
                              className="w-32 h-8 rounded-full border-orange-200 dark:border-orange-700 bg-white/50 dark:bg-gray-800/50"
                            />
                          </div>
                        </div>
                      ))}
                    </div>

                    {order.chefNotes && (
                      <div className="mt-3 p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-2xl border border-yellow-200 dark:border-yellow-800">
                        <p className="text-sm text-yellow-800 dark:text-yellow-200">
                          <strong>Chef Notes:</strong> {order.chefNotes}
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}

              {filteredAndSortedOrders.length === 0 && (
                <div className="flex flex-col items-center justify-center h-40">
                  <div className="p-4 bg-gradient-to-br from-orange-100 via-amber-100 to-yellow-100 dark:from-orange-900/30 dark:via-amber-900/30 dark:to-yellow-900/30 rounded-full mb-4">
                    <Utensils className="h-8 w-8 text-orange-600 dark:text-orange-400" />
                  </div>
                  <p className="text-muted-foreground font-medium">
                    No orders found
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Orders will appear here when they&rsquo;re placed
                  </p>
                </div>
              )}
            </div>
          </ScrollArea>
        </div>
      </div>
    </div>
  );
}

export default function KitchenPage() {
  return (
    <OrderProvider>
      <RoleGuard section="kitchen">
        <KitchenContent />
      </RoleGuard>
    </OrderProvider>
  );
}
