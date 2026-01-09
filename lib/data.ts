import { MenuItem, InventoryItem, SalesData } from "./types";

// --- Menu Items ---

export async function getMenuItems(): Promise<MenuItem[]> {
  if (typeof window === "undefined") return [];
  try {
    const res = await fetch("/api/menu", { cache: "no-store" });
    if (!res.ok) throw new Error("Failed to fetch menu");
    const data = await res.json();
    return data;
  } catch (error) {
    console.error("Error fetching menu items:", error);
    return [];
  }
}

export async function createMenuItem(
  item: Omit<MenuItem, "id">
): Promise<MenuItem | null> {
  try {
    const res = await fetch("/api/menu", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(item),
    });
    if (!res.ok) throw new Error("Failed to create menu item");
    const data = await res.json();
    return { ...item, id: data.id } as MenuItem;
  } catch (error) {
    console.error("Error creating menu item:", error);
    return null;
  }
}

export async function updateMenuItem(item: MenuItem): Promise<boolean> {
  try {
    const res = await fetch(`/api/menu/${item.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(item),
    });
    return res.ok;
  } catch (error) {
    console.error("Error updating menu item:", error);
    return false;
  }
}

export async function deleteMenuItem(id: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/menu/${id}`, { method: "DELETE" });
    return res.ok;
  } catch (error) {
    console.error("Error deleting menu item:", error);
    return false;
  }
}

// --- Inventory Items ---

export async function getInventoryItems(): Promise<InventoryItem[]> {
  try {
    const res = await fetch("/api/inventory", { cache: "no-store" });
    if (!res.ok) throw new Error("Failed to fetch inventory");
    return await res.json();
  } catch (error) {
    console.error("Error fetching inventory items:", error);
    return [];
  }
}

export async function createInventoryItem(
  item: Omit<InventoryItem, "id">
): Promise<InventoryItem | null> {
  try {
    const res = await fetch("/api/inventory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(item),
    });
    if (!res.ok) throw new Error("Failed to create inventory item");
    const data = await res.json();
    return { ...item, id: data.id } as InventoryItem;
  } catch (error) {
    console.error("Error creating inventory item:", error);
    return null;
  }
}

export async function updateInventoryItem(
  item: InventoryItem
): Promise<boolean> {
  try {
    const res = await fetch(`/api/inventory/${item.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(item),
    });
    return res.ok;
  } catch (error) {
    console.error("Error updating inventory item:", error);
    return false;
  }
}

export async function deleteInventoryItem(id: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/inventory/${id}`, { method: "DELETE" });
    return res.ok;
  } catch (error) {
    console.error("Error deleting inventory item:", error);
    return false;
  }
}

// Deprecated - do not use
export function saveInventoryItems(_items: InventoryItem[]) {
  void _items;
  // Deprecated
}

export async function exportInventoryData() {
  return getInventoryItems();
}

// --- Orders / Sales ---

export async function getOrderNumber(): Promise<string> {
  try {
    const res = await fetch("/api/orders/next-number");
    if (!res.ok) return `ORD-${Date.now()}`;
    const data = await res.json();
    return data.orderNumber;
  } catch {
    return `ORD-${Date.now()}`;
  }
}

export function generateOrderId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 10);
  return `SALE-${timestamp}-${random}`;
}

export function generateProductOrderId(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substr(2, 9);
  return `PROD-${timestamp}-${random}`;
}

export function generateProductOrderNumber(): string {
  const today = new Date();
  const dateStr = today.toISOString().slice(0, 10).replace(/-/g, "");
  const random = Math.floor(Math.random() * 10000);
  return `P-${dateStr}-${random.toString().padStart(4, "0")}`;
}

export function resetOrderCounters(_preserveData: boolean = true): void {
  void _preserveData;
  console.warn("resetOrderCounters is deprecated in Neon mode");
}

export function getCurrentOrderCounter(): number {
  return 0;
}

export function getCurrentProductOrderCounter(): number {
  return 0;
}

export async function getSalesData(): Promise<SalesData[]> {
  try {
    const res = await fetch("/api/transactions");
    if (!res.ok) throw new Error("Failed to fetch transactions");
    const logs = await res.json();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return logs.map((log: any) => ({
      id: log.transaction_id || log.id,
      orderNumber: log.metadata?.orderNumber || log.transaction_id || "Unknown",
      date: log.created_at,
      total: Number(log.amount),
      paymentMethod: log.payment_method,
      items: log.metadata?.items || [],
      orderType: log.metadata?.orderType || "dine-in",
      tableNumber: log.metadata?.tableNumber,
      customerName: log.metadata?.customerName || log.customer_id,
      customerRefused: log.metadata?.customerRefused,
    }));
  } catch (error) {
    console.error("Error fetching sales data:", error);
    return [];
  }
}

export async function addSaleData(sale: SalesData): Promise<boolean> {
  try {
    const res = await fetch("/api/transactions/log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: sale.id,
        orderId: sale.orderId,
        amount: sale.total,
        status: "success", // Assuming success if we are adding it
        paymentMethod: sale.paymentMethod,
        timestamp: sale.date,
        metadata: {
          orderNumber: sale.orderNumber,
          items: sale.items,
          orderType: sale.orderType,
          tableNumber: sale.tableNumber,
          customerName: sale.customerName,
          customerRefused: sale.customerRefused,
        },
      }),
    });
    return res.ok;
  } catch (e) {
    console.error("Error adding sale:", e);
    return false;
  }
}

export async function findSaleByOrderNumber(
  orderNumber: string
): Promise<SalesData | undefined> {
  const sales = await getSalesData();
  return sales.find((s) => s.orderNumber === orderNumber);
}

// Database wrappers (now redundant but kept for interface compatibility if needed)
export async function getMenuItemsFromDatabase(): Promise<MenuItem[]> {
  return getMenuItems();
}

export async function saveMenuItemsToDatabase(
  items: MenuItem[]
): Promise<void> {
  // Deprecated
}
