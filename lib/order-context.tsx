"use client";

import type React from "react";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";
import type { OrderItem } from "./types";
import { addSaleData, getSalesData } from "./data";

export interface KitchenOrder {
  id: string;
  orderId?: string;
  orderNumber: string;
  items: OrderItem[];
  total: number;
  orderType: "dine-in" | "takeout" | "delivery";
  tableNumber?: string;
  customerName?: string;
  customerRefused?: boolean;
  paymentMethod: string;
  status: "pending" | "in-progress" | "ready" | "completed";
  priority: "low" | "normal" | "high" | "urgent";
  createdAt: string;
  updatedAt: string;
  estimatedTime?: number; // in minutes
  notes?: string;
  chefNotes?: string;
}

interface OrderContextType {
  orders: KitchenOrder[];
  updateOrderStatus: (orderId: string, status: KitchenOrder["status"]) => void;
  updateOrderItemStatus: (
    orderId: string,
    itemId: string,
    status: OrderItem["status"]
  ) => Promise<boolean>;
  updateOrderNotes: (orderId: string, notes: string) => void;
  updateOrderPriority: (
    orderId: string,
    priority: KitchenOrder["priority"]
  ) => void;
  addOrder: (
    order: Omit<
      KitchenOrder,
      "id" | "status" | "priority" | "createdAt" | "updatedAt"
    >
  ) => void;
  getOrderById: (orderId: string) => KitchenOrder | undefined;
  getOrdersByClient: () => Record<string, KitchenOrder[]>;
  refreshOrders: () => void;
}

const OrderContext = createContext<OrderContextType | undefined>(undefined);

export function OrderProvider({ children }: { children: React.ReactNode }) {
  const [orders, setOrders] = useState<KitchenOrder[]>([]);

  // Load orders from API
  const loadOrders = useCallback(async () => {
    try {
      const res = await fetch("/api/orders");
      if (res.ok) {
        const data = await res.json();
        setOrders(data);
      } else {
        console.error("Failed to load orders");
      }
    } catch (error) {
      console.error("Error loading orders:", error);
    }
  }, []);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  // Save orders to API and dispatch events
  const saveOrders = useCallback(async (newOrders: KitchenOrder[]) => {
    // Dispatch custom event for real-time updates (local only)
    if (typeof window !== "undefined") {
      const event = new CustomEvent("ordersUpdated", {
        detail: { orders: newOrders, timestamp: Date.now() },
      });
      window.dispatchEvent(event);
    }
  }, []);

  // Auto-update order status based on item statuses
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _updateOrderStatusFromItems = useCallback(
    (order: KitchenOrder): KitchenOrder["status"] => {
      const itemStatuses = order.items.map((item) => item.status || "pending");

      if (itemStatuses.every((status) => status === "served")) {
        return "completed";
      } else if (
        itemStatuses.every(
          (status) => status === "ready" || status === "served"
        )
      ) {
        return "ready";
      } else if (
        itemStatuses.some(
          (status) => status === "preparing" || status === "ready"
        )
      ) {
        return "in-progress";
      } else {
        return "pending";
      }
    },
    []
  );

  const updateOrderStatus = useCallback(
    async (orderId: string, status: KitchenOrder["status"]) => {
      // Optimistic update
      setOrders((prev) => {
        const updated = prev.map((order) =>
          order.id === orderId
            ? {
                ...order,
                status,
                updatedAt: new Date().toISOString(),
                estimatedTime:
                  status === "ready" || status === "completed"
                    ? 0
                    : order.estimatedTime,
              }
            : order
        );
        saveOrders(updated);
        return updated;
      });

      // API Update
      try {
        await fetch(`/api/orders/${orderId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        });
      } catch (error) {
        console.error("Failed to update order status:", error);
        // Could revert state here if needed
      }

      // Archive logic (simplified for now, ideally backend handles this)
      if (status === "completed") {
        const order = orders.find((o) => o.id === orderId);
        if (order) {
          // Client-side archiving logic... (optional, maybe move to backend later)
          // Keeping existing logic for now
          getSalesData().then((sales) => {
            const alreadyArchived = sales.some(
              (s) => s.orderNumber === order.orderNumber
            );
            if (!alreadyArchived) {
              addSaleData({
                id: order.id,
                orderNumber: order.orderNumber,
                orderId: order.orderId,
                date: new Date().toISOString(),
                items: order.items,
                total: order.total,
                orderType: order.orderType,
                tableNumber: order.tableNumber,
                customerName: order.customerRefused ? "" : order.customerName,
                customerRefused: !!order.customerRefused,
                paymentMethod: order.paymentMethod,
              });
            }
          });
        }
      }
    },
    [orders, saveOrders]
  );

  const updateOrderItemStatus = useCallback(
    async (orderId: string, itemId: string, status: OrderItem["status"]) => {
      // Validation
      const validStatuses: OrderItem["status"][] = [
        "pending",
        "preparing",
        "ready",
        "served",
      ];
      if (!validStatuses.includes(status)) {
        console.error(`Invalid status: ${status}`);
        return false;
      }

      // Optimistic update
      setOrders((prev) => {
        const updated = prev.map((order) => {
          if (order.id !== orderId) return order;

          const updatedItems = order.items.map((item) =>
            item.id === itemId ? { ...item, status } : item
          );

          // Auto-update order status based on items
          let newOrderStatus = order.status;
          const allReady = updatedItems.every(
            (item) => item.status === "ready" || item.status === "served"
          );
          const anyPreparing = updatedItems.some(
            (item) => item.status === "preparing"
          );
          const anyReady = updatedItems.some(
            (item) => item.status === "ready" || item.status === "served"
          );

          if (allReady && order.status !== "completed") {
            newOrderStatus = "ready";
          } else if ((anyPreparing || anyReady) && order.status === "pending") {
            newOrderStatus = "in-progress";
          }

          return {
            ...order,
            items: updatedItems,
            status: newOrderStatus,
            updatedAt: new Date().toISOString(),
          };
        });
        saveOrders(updated);
        return updated;
      });

      // API Update with Error Handling
      try {
        const res = await fetch(`/api/orders/items/${itemId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        });

        if (!res.ok) {
          throw new Error(`Failed to update item status: ${res.statusText}`);
        }

        // Sync parent order status with DB if needed
        const currentOrder = orders.find((o) => o.id === orderId);
        if (currentOrder) {
          const updatedItems = currentOrder.items.map((item) =>
            item.id === itemId ? { ...item, status } : item
          );

          let newOrderStatus = currentOrder.status;
          const allReady = updatedItems.every(
            (item) => item.status === "ready" || item.status === "served"
          );
          const anyPreparing = updatedItems.some(
            (item) => item.status === "preparing"
          );
          const anyReady = updatedItems.some(
            (item) => item.status === "ready" || item.status === "served"
          );
          const allServed = updatedItems.every(
            (item) => item.status === "served"
          );

          if (allServed) {
            newOrderStatus = "completed";
          } else if (allReady && currentOrder.status !== "completed") {
            newOrderStatus = "ready";
          } else if (
            (anyPreparing || anyReady) &&
            currentOrder.status === "pending"
          ) {
            newOrderStatus = "in-progress";
          }

          if (newOrderStatus !== currentOrder.status) {
            await fetch(`/api/orders/${orderId}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ status: newOrderStatus }),
            });
          }
        }

        return true;
      } catch (error) {
        console.error("Failed to update item status, reverting:", error);
        loadOrders(); // Revert to server state on error
        return false;
      }
    },
    [orders, saveOrders, loadOrders]
  );

  const updateOrderNotes = useCallback(
    async (orderId: string, notes: string) => {
      setOrders((prev) => {
        const updated = prev.map((order) =>
          order.id === orderId
            ? {
                ...order,
                chefNotes: notes,
                updatedAt: new Date().toISOString(),
              }
            : order
        );
        saveOrders(updated);
        return updated;
      });

      try {
        await fetch(`/api/orders/${orderId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chefNotes: notes }),
        });
      } catch (error) {
        console.error("Failed to update chef notes:", error);
      }
    },
    [saveOrders]
  );

  const updateOrderPriority = useCallback(
    async (orderId: string, priority: KitchenOrder["priority"]) => {
      setOrders((prev) => {
        const updated = prev.map((order) =>
          order.id === orderId
            ? {
                ...order,
                priority,
                updatedAt: new Date().toISOString(),
              }
            : order
        );
        saveOrders(updated);
        return updated;
      });

      try {
        await fetch(`/api/orders/${orderId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ priority }),
        });
      } catch (error) {
        console.error("Failed to update priority:", error);
      }
    },
    [saveOrders]
  );

  const addOrder = useCallback(
    async (
      orderData: Omit<
        KitchenOrder,
        "id" | "status" | "priority" | "createdAt" | "updatedAt"
      >
    ) => {
      const tempId = `temp-${Date.now()}`;
      const newOrder: KitchenOrder = {
        ...orderData,
        id: tempId,
        status: "pending",
        priority: "normal",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // Optimistic update
      setOrders((prev) => {
        const updated = [newOrder, ...prev];
        saveOrders(updated);
        return updated;
      });

      // API Call
      try {
        const res = await fetch("/api/orders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(orderData),
        });

        if (res.ok) {
          const data = await res.json();
          // Update the temp ID with real ID
          setOrders((prev) =>
            prev.map((o) => (o.id === tempId ? { ...o, id: data.id } : o))
          );
        } else {
          console.error("Failed to add order to DB");
        }
      } catch (error) {
        console.error("Error adding order:", error);
      }
    },
    [saveOrders]
  );

  const getOrderById = useCallback(
    (orderId: string) => {
      return orders.find((order) => order.id === orderId);
    },
    [orders]
  );

  const getOrdersByClient = useCallback(() => {
    const clientGroups: Record<string, KitchenOrder[]> = {};

    orders.forEach((order) => {
      const clientKey =
        order.orderType === "dine-in"
          ? `Table ${order.tableNumber}`
          : order.customerName || "Unknown Customer";

      if (!clientGroups[clientKey]) {
        clientGroups[clientKey] = [];
      }
      clientGroups[clientKey].push(order);
    });

    return clientGroups;
  }, [orders]);

  const refreshOrders = useCallback(() => {
    loadOrders();
  }, [loadOrders]);

  // Auto-archive completed orders after 24 hours
  useEffect(() => {
    const archiveCompletedOrders = () => {
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

      setOrders((prev) => {
        const activeOrders = prev.filter((order) => {
          if (order.status === "completed") {
            const completedAt = new Date(order.updatedAt);
            return completedAt > twentyFourHoursAgo;
          }
          return true;
        });

        if (activeOrders.length !== prev.length) {
          saveOrders(activeOrders);
        }

        return activeOrders;
      });
    };

    // Check every hour
    const interval = setInterval(archiveCompletedOrders, 60 * 60 * 1000);
    return () => clearInterval(interval);
  }, [saveOrders]);

  return (
    <OrderContext.Provider
      value={{
        orders,
        updateOrderStatus,
        updateOrderItemStatus,
        updateOrderNotes,
        updateOrderPriority,
        addOrder,
        getOrderById,
        getOrdersByClient,
        refreshOrders,
      }}
    >
      {children}
    </OrderContext.Provider>
  );
}

export function useOrders() {
  const context = useContext(OrderContext);
  if (context === undefined) {
    throw new Error("useOrders must be used within an OrderProvider");
  }
  return context;
}
