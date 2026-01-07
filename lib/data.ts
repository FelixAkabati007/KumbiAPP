// All mock data and functions have been removed. Use this file for real data utilities or database integration.

// Persistent storage for menu items using localStorage
import type { MenuItem, InventoryItem } from "./types";
import { env, features } from "./env";

const MENU_ITEMS_KEY = "menuItems";
const ORDER_COUNTER_KEY = "orderCounter";
const PRODUCT_ORDER_COUNTER_KEY = "productOrderCounter";
const INVENTORY_ITEMS_KEY = "inventoryItems";

export function getMenuItems(): MenuItem[] {
  if (typeof window === "undefined") return [];
  const data = localStorage.getItem(MENU_ITEMS_KEY);
  return data ? JSON.parse(data) : [];
}

export function saveMenuItems(items: MenuItem[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(MENU_ITEMS_KEY, JSON.stringify(items));
  try {
    // Notify other windows/components that menu items have changed
    const event = new CustomEvent("menuItemsUpdated", {
      detail: { count: items.length },
    });
    window.dispatchEvent(event);
  } catch (err) {
    // ignore if CustomEvent is not supported for some reason
    // eslint-disable-next-line no-console
    console.debug("menuItemsUpdated event dispatch failed", err);
  }
}

export function getInventoryItems(): InventoryItem[] {
  if (typeof window === "undefined") return [];
  const data = localStorage.getItem(INVENTORY_ITEMS_KEY);
  return data ? JSON.parse(data) : [];
}

export function saveInventoryItems(items: InventoryItem[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(INVENTORY_ITEMS_KEY, JSON.stringify(items));
}

export function exportInventoryData() {
  return getInventoryItems();
}

// Generate unique order number for the entire order
export function getOrderNumber(): string {
  if (typeof window === "undefined") return "ORD-0001";

  const today = new Date();
  const dateStr = today.toISOString().slice(0, 10).replace(/-/g, "");

  // Get and increment order counter
  const counter = parseInt(localStorage.getItem(ORDER_COUNTER_KEY) || "0") + 1;
  localStorage.setItem(ORDER_COUNTER_KEY, counter.toString());

  // Format: ORD-YYYYMMDD-XXXX (e.g., ORD-20241203-0001)
  return `ORD-${dateStr}-${counter.toString().padStart(4, "0")}`;
}

// Generate unique sale-level order ID for tracking across systems
export function generateOrderId(): string {
  // Use crypto if available for stronger uniqueness
  try {
    const array = new Uint8Array(12);
    if (typeof crypto !== "undefined" && crypto.getRandomValues) {
      crypto.getRandomValues(array);
      const hex = Array.from(array)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      return `SALE-${Date.now().toString(36)}-${hex.slice(0, 16)}`;
    }
  } catch {
    // fall through to non-crypto path
  }

  // Fallback: timestamp + random segment
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 10);
  return `SALE-${timestamp}-${random}`;
}

// Generate unique product order ID for individual items in cart
export function generateProductOrderId(): string {
  if (typeof window === "undefined") return `PROD-${Date.now()}`;

  const timestamp = Date.now();
  const random = Math.random().toString(36).substr(2, 9);

  // Format: PROD-TIMESTAMP-RANDOM (e.g., PROD-1701567890123-abc123def)
  return `PROD-${timestamp}-${random}`;
}

// Generate unique product order number for individual items
export function generateProductOrderNumber(): string {
  if (typeof window === "undefined") return "P-0001";

  const today = new Date();
  const dateStr = today.toISOString().slice(0, 10).replace(/-/g, "");

  // Get and increment product order counter
  const counter =
    parseInt(localStorage.getItem(PRODUCT_ORDER_COUNTER_KEY) || "0") + 1;
  localStorage.setItem(PRODUCT_ORDER_COUNTER_KEY, counter.toString());

  // Format: P-YYYYMMDD-XXXX (e.g., P-20241203-0001)
  return `P-${dateStr}-${counter.toString().padStart(4, "0")}`;
}

// Reset counters and preserve historical data
export function resetOrderCounters(preserveData: boolean = true): void {
  if (typeof window === "undefined") return;

  if (preserveData) {
    // Archive current sales data before reset
    const currentDate = new Date().toISOString().split("T")[0];
    const salesData = getSalesData();
    const archiveKey = `archived_sales_${currentDate}`;
    try {
      localStorage.setItem(archiveKey, JSON.stringify(salesData));
    } catch (err) {
      console.error("Failed to archive sales data:", err);
      throw new Error("Failed to archive sales data before reset");
    }
  }

  // Reset counters
  localStorage.setItem(ORDER_COUNTER_KEY, "0");
  localStorage.setItem(PRODUCT_ORDER_COUNTER_KEY, "0");

  // Notify other components about the reset
  try {
    window.dispatchEvent(
      new CustomEvent("orderCountersReset", {
        detail: { timestamp: new Date().toISOString() },
      })
    );
  } catch (err) {
    console.error("Failed to dispatch reset event:", err);
  }
}

// Get current order counter (for display purposes)
export function getCurrentOrderCounter(): number {
  if (typeof window === "undefined") return 0;
  return parseInt(localStorage.getItem(ORDER_COUNTER_KEY) || "0");
}

// Get current product order counter (for display purposes)
export function getCurrentProductOrderCounter(): number {
  if (typeof window === "undefined") return 0;
  return parseInt(localStorage.getItem(PRODUCT_ORDER_COUNTER_KEY) || "0");
}

// Persistent storage for sales data
import type { SalesData } from "./types";
const SALES_DATA_KEY = "salesData";

export function getSalesData(): SalesData[] {
  if (typeof window === "undefined") return [];
  const data = localStorage.getItem(SALES_DATA_KEY);
  return data ? JSON.parse(data) : [];
}

export function saveSalesData(sales: SalesData[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(SALES_DATA_KEY, JSON.stringify(sales));
}

export function addSaleData(sale: SalesData): void {
  if (typeof window === "undefined") return;
  const sales = getSalesData();
  sales.unshift(sale); // Add newest first
  saveSalesData(sales);
}

// Find a sale by order number
export function findSaleByOrderNumber(
  orderNumber: string
): SalesData | undefined {
  return getSalesData().find((sale) => sale.orderNumber === orderNumber);
}

// Utility: Get receipt statistics (daily, weekly, monthly, total)
export function getReceiptStats() {
  const sales = getSalesData();
  const now = new Date();

  // Helper to check if two dates are the same day
  function isSameDay(d1: Date, d2: Date) {
    return (
      d1.getFullYear() === d2.getFullYear() &&
      d1.getMonth() === d2.getMonth() &&
      d1.getDate() === d2.getDate()
    );
  }

  // Helper to check if two dates are in the same week (ISO week)
  function isSameWeek(d1: Date, d2: Date) {
    const getWeek = (d: Date) => {
      const date = new Date(d.getTime());
      date.setHours(0, 0, 0, 0);
      // Thursday in current week decides the year.
      date.setDate(date.getDate() + 3 - ((date.getDay() + 6) % 7));
      const week1 = new Date(date.getFullYear(), 0, 4);
      return (
        date.getFullYear() +
        "-" +
        Math.floor(
          1 +
            ((date.getTime() - week1.getTime()) / 86400000 -
              3 +
              ((week1.getDay() + 6) % 7)) /
              7
        )
      );
    };
    return getWeek(d1) === getWeek(d2);
  }

  // Helper to check if two dates are in the same month
  function isSameMonth(d1: Date, d2: Date) {
    return (
      d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth()
    );
  }

  let today = 0,
    week = 0,
    month = 0;
  const total = sales.length;

  for (const sale of sales) {
    const saleDate = new Date(sale.date);
    if (isSameDay(saleDate, now)) today++;
    if (isSameWeek(saleDate, now)) week++;
    if (isSameMonth(saleDate, now)) month++;
  }

  return { today, week, month, total };
}

// Future: Database integration functions
// These will be implemented when you add a real database
export async function getMenuItemsFromDatabase(): Promise<MenuItem[]> {
  if (features.hasDatabase) {
    try {
      const res = await fetch(`${env.APP_URL}/api/menu`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`GET /api/menu failed: ${res.status}`);
      return (await res.json()) as MenuItem[];
    } catch (e) {
      console.error("getMenuItemsFromDatabase error:", e);
    }
  }
  return getMenuItems(); // Fallback to localStorage
}

export async function saveMenuItemsToDatabase(
  items: MenuItem[]
): Promise<void> {
  if (features.hasDatabase) {
    try {
      for (const item of items) {
        const res = await fetch(`${env.APP_URL}/api/menu`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(item),
        });
        if (!res.ok) {
          throw new Error(`POST /api/menu failed: ${res.status}`);
        }
      }
      return;
    } catch (e) {
      console.error("saveMenuItemsToDatabase error:", e);
    }
  }
  saveMenuItems(items); // Fallback to localStorage
}
