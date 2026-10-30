import type { MenuItem } from "@/lib/types";

export interface CachedAuthUser {
  id: string;
  role: string;
  name: string;
  email: string;
  avatar_url?: string;
  cachedAt: number;
}

export interface QueuedOfflineOrder {
  id: string; // client UUID / idempotency key
  orderNumber: string;
  payload: {
    orderNumber: string;
    total: number;
    orderType: string;
    tableNumber?: string;
    customerName?: string;
    paymentMethod: string;
    items: Array<{
      id?: string;
      name: string;
      price: number;
      category?: string;
      quantity: number;
      discountPercent?: number;
      notes?: string;
      prepTime?: number;
    }>;
    estimatedTime?: number;
  };
  createdAt: string;
  status: "pending" | "syncing" | "failed";
  retryCount: number;
  lastError?: string;
}

export interface QueuedOfflineAttendance {
  id: string;
  payload: {
    action: "check_in" | "check_out" | "clock_in" | "clock_out";
    attendanceId?: string;
    latitude?: number | null;
    longitude?: number | null;
    notes?: string;
  };
  createdAt: string;
  status: "pending" | "syncing" | "failed";
  retryCount: number;
  lastError?: string;
}

export interface QueuedOfflineMutation {
  id: string;
  type: string;
  url: string;
  method: "POST" | "PUT" | "PATCH" | "DELETE";
  payload: unknown;
  createdAt: string;
  status: "pending" | "syncing" | "failed";
  retryCount: number;
  lastError?: string;
}

export interface OfflineQueueStats {
  orders: number;
  attendance: number;
  mutations: number;
  total: number;
  isOnline: boolean;
  isSyncing: boolean;
  lastSyncedAt?: string;
}

const STORAGE_KEYS = {
  AUTH_USER: "kumbi_offline_auth_user",
  MENU_CATALOG: "kumbi_offline_menu_catalog",
  INVENTORY_SNAPSHOT: "kumbi_offline_inventory_snapshot",
  ORDERS_QUEUE: "kumbi_offline_orders_queue",
  ATTENDANCE_QUEUE: "kumbi_offline_attendance_queue",
  MUTATIONS_QUEUE: "kumbi_offline_mutations_queue",
  LAST_SYNC: "kumbi_offline_last_sync",
} as const;

// In-memory fallback if localStorage is disabled or fails
const memoryStore = new Map<string, string>();

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function safeGetItem(key: string): string | null {
  if (!isBrowser()) return memoryStore.get(key) ?? null;
  try {
    return window.localStorage.getItem(key) ?? memoryStore.get(key) ?? null;
  } catch {
    return memoryStore.get(key) ?? null;
  }
}

function safeSetItem(key: string, value: string): void {
  if (!isBrowser()) {
    memoryStore.set(key, value);
    return;
  }
  try {
    window.localStorage.setItem(key, value);
    memoryStore.set(key, value);
  } catch (err) {
    console.warn(`[OfflineStorage] Failed to write to localStorage for key ${key}:`, err);
    memoryStore.set(key, value);
  }
}

function safeRemoveItem(key: string): void {
  if (!isBrowser()) {
    memoryStore.delete(key);
    return;
  }
  try {
    window.localStorage.removeItem(key);
    memoryStore.delete(key);
  } catch {
    memoryStore.delete(key);
  }
}

function parseJson<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

// Global broadcast channel for cross-tab sync
let offlineChannel: BroadcastChannel | null = null;
if (typeof window !== "undefined" && "BroadcastChannel" in window) {
  try {
    offlineChannel = new BroadcastChannel("kumbi-offline-storage");
    offlineChannel.onmessage = (event) => {
      if (event.data?.type === "queue_changed") {
        notifySubscribers();
      }
    };
  } catch {
    offlineChannel = null;
  }
}

type QueueListener = (stats: OfflineQueueStats) => void;
const subscribers = new Set<QueueListener>();

let isCurrentlySyncing = false;

function notifySubscribers(): void {
  const stats = getOfflineQueueStats();
  subscribers.forEach((cb) => {
    try {
      cb(stats);
    } catch (e) {
      console.error("[OfflineStorage] Subscriber notification error:", e);
    }
  });

  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("kumbi:offline-queue-changed", { detail: stats })
    );
  }
}

function broadcastQueueChanged(): void {
  notifySubscribers();
  if (offlineChannel) {
    try {
      offlineChannel.postMessage({ type: "queue_changed", timestamp: Date.now() });
    } catch {
      // ignore
    }
  }
}

export function subscribeOfflineQueue(listener: QueueListener): () => void {
  subscribers.add(listener);
  // Send initial stats
  listener(getOfflineQueueStats());
  return () => {
    subscribers.delete(listener);
  };
}

/* =======================================================================
   1. AUTH SESSION CACHE
   ======================================================================= */

export function getOfflineCachedUser(): CachedAuthUser | null {
  const raw = safeGetItem(STORAGE_KEYS.AUTH_USER);
  const cached = parseJson<CachedAuthUser | null>(raw, null);
  if (!cached) return null;

  // Max offline session duration: 72 hours
  const MAX_OFFLINE_SESSION_MS = 72 * 60 * 60 * 1000;
  if (Date.now() - cached.cachedAt > MAX_OFFLINE_SESSION_MS) {
    safeRemoveItem(STORAGE_KEYS.AUTH_USER);
    return null;
  }
  return cached;
}

export function setOfflineCachedUser(
  user: { id: string; role: string; name: string; email: string; avatar_url?: string } | null
): void {
  if (!user) {
    safeRemoveItem(STORAGE_KEYS.AUTH_USER);
    return;
  }
  const cached: CachedAuthUser = {
    ...user,
    cachedAt: Date.now(),
  };
  safeSetItem(STORAGE_KEYS.AUTH_USER, JSON.stringify(cached));
}

export function clearOfflineCachedUser(): void {
  safeRemoveItem(STORAGE_KEYS.AUTH_USER);
}

/* =======================================================================
   2. CATALOG & INVENTORY SNAPSHOTS
   ======================================================================= */

export function getOfflineMenuCatalog(): MenuItem[] {
  const raw = safeGetItem(STORAGE_KEYS.MENU_CATALOG);
  return parseJson<MenuItem[]>(raw, []);
}

export function setOfflineMenuCatalog(items: MenuItem[]): void {
  if (!Array.isArray(items)) return;
  safeSetItem(STORAGE_KEYS.MENU_CATALOG, JSON.stringify(items));
}

export function getOfflineInventory<T = unknown>(): T[] {
  const raw = safeGetItem(STORAGE_KEYS.INVENTORY_SNAPSHOT);
  return parseJson<T[]>(raw, []);
}

export function setOfflineInventory<T = unknown>(items: T[]): void {
  if (!Array.isArray(items)) return;
  safeSetItem(STORAGE_KEYS.INVENTORY_SNAPSHOT, JSON.stringify(items));
}

/* =======================================================================
   3. QUEUED ORDERS (POS CHECKOUT)
   ======================================================================= */

export function getQueuedOrders(): QueuedOfflineOrder[] {
  const raw = safeGetItem(STORAGE_KEYS.ORDERS_QUEUE);
  return parseJson<QueuedOfflineOrder[]>(raw, []);
}

export function enqueueOfflineOrder(order: QueuedOfflineOrder): void {
  const orders = getQueuedOrders();
  // Deduplicate by id or orderNumber
  const existingIdx = orders.findIndex(
    (o) => o.id === order.id || o.orderNumber === order.orderNumber
  );
  if (existingIdx >= 0) {
    orders[existingIdx] = order;
  } else {
    orders.push(order);
  }
  safeSetItem(STORAGE_KEYS.ORDERS_QUEUE, JSON.stringify(orders));
  broadcastQueueChanged();
}

export function removeQueuedOrder(id: string): void {
  const orders = getQueuedOrders().filter((o) => o.id !== id && o.orderNumber !== id);
  safeSetItem(STORAGE_KEYS.ORDERS_QUEUE, JSON.stringify(orders));
  broadcastQueueChanged();
}

export function updateQueuedOrder(id: string, updates: Partial<QueuedOfflineOrder>): void {
  const orders = getQueuedOrders().map((o) =>
    o.id === id || o.orderNumber === id ? { ...o, ...updates } : o
  );
  safeSetItem(STORAGE_KEYS.ORDERS_QUEUE, JSON.stringify(orders));
  broadcastQueueChanged();
}

/* =======================================================================
   4. QUEUED ATTENDANCE PUNCHES
   ======================================================================= */

export function getQueuedAttendance(): QueuedOfflineAttendance[] {
  const raw = safeGetItem(STORAGE_KEYS.ATTENDANCE_QUEUE);
  return parseJson<QueuedOfflineAttendance[]>(raw, []);
}

export function enqueueOfflineAttendance(attendance: QueuedOfflineAttendance): void {
  const queue = getQueuedAttendance();
  const existingIdx = queue.findIndex((a) => a.id === attendance.id);
  if (existingIdx >= 0) {
    queue[existingIdx] = attendance;
  } else {
    queue.push(attendance);
  }
  safeSetItem(STORAGE_KEYS.ATTENDANCE_QUEUE, JSON.stringify(queue));
  broadcastQueueChanged();
}

export function removeQueuedAttendance(id: string): void {
  const queue = getQueuedAttendance().filter((a) => a.id !== id);
  safeSetItem(STORAGE_KEYS.ATTENDANCE_QUEUE, JSON.stringify(queue));
  broadcastQueueChanged();
}

/* =======================================================================
   5. QUEUED GENERAL MUTATIONS
   ======================================================================= */

export function getQueuedMutations(): QueuedOfflineMutation[] {
  const raw = safeGetItem(STORAGE_KEYS.MUTATIONS_QUEUE);
  return parseJson<QueuedOfflineMutation[]>(raw, []);
}

export function enqueueOfflineMutation(mutation: QueuedOfflineMutation): void {
  const queue = getQueuedMutations();
  const existingIdx = queue.findIndex((m) => m.id === mutation.id);
  if (existingIdx >= 0) {
    queue[existingIdx] = mutation;
  } else {
    queue.push(mutation);
  }
  safeSetItem(STORAGE_KEYS.MUTATIONS_QUEUE, JSON.stringify(queue));
  broadcastQueueChanged();
}

export function removeQueuedMutation(id: string): void {
  const queue = getQueuedMutations().filter((m) => m.id !== id);
  safeSetItem(STORAGE_KEYS.MUTATIONS_QUEUE, JSON.stringify(queue));
  broadcastQueueChanged();
}

/* =======================================================================
   6. QUEUE METRICS & OVERVIEW
   ======================================================================= */

export function getOfflineQueueStats(): OfflineQueueStats {
  const orders = getQueuedOrders();
  const attendance = getQueuedAttendance();
  const mutations = getQueuedMutations();
  const isOnline = typeof navigator !== "undefined" ? navigator.onLine : true;
  const lastSyncedAt = safeGetItem(STORAGE_KEYS.LAST_SYNC) || undefined;

  return {
    orders: orders.length,
    attendance: attendance.length,
    mutations: mutations.length,
    total: orders.length + attendance.length + mutations.length,
    isOnline,
    isSyncing: isCurrentlySyncing,
    lastSyncedAt,
  };
}

export function clearAllQueues(): void {
  safeRemoveItem(STORAGE_KEYS.ORDERS_QUEUE);
  safeRemoveItem(STORAGE_KEYS.ATTENDANCE_QUEUE);
  safeRemoveItem(STORAGE_KEYS.MUTATIONS_QUEUE);
  broadcastQueueChanged();
}

/* =======================================================================
   7. BACKGROUND SYNCHRONIZATION ENGINE
   ======================================================================= */

export interface SyncResult {
  syncedOrders: number;
  syncedAttendance: number;
  syncedMutations: number;
  failedCount: number;
  errors: string[];
}

export async function processOfflineQueue(): Promise<SyncResult> {
  if (isCurrentlySyncing) {
    return { syncedOrders: 0, syncedAttendance: 0, syncedMutations: 0, failedCount: 0, errors: ["Sync already in progress"] };
  }

  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return { syncedOrders: 0, syncedAttendance: 0, syncedMutations: 0, failedCount: 0, errors: ["Device is offline"] };
  }

  isCurrentlySyncing = true;
  notifySubscribers();

  const result: SyncResult = {
    syncedOrders: 0,
    syncedAttendance: 0,
    syncedMutations: 0,
    failedCount: 0,
    errors: [],
  };

  try {
    // 1. Process Queued Orders
    const orders = getQueuedOrders();
    for (const order of orders) {
      try {
        updateQueuedOrder(order.id, { status: "syncing" });
        const res = await fetch("/api/orders/complete", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": order.id,
          },
          body: JSON.stringify(order.payload),
        });

        if (res.ok) {
          removeQueuedOrder(order.id);
          result.syncedOrders++;
        } else {
          const errData = await res.json().catch(() => ({}));
          // If already saved or duplicate, consider it reconciled
          if (res.status === 400 && String(errData?.error).includes("already exists")) {
            removeQueuedOrder(order.id);
            result.syncedOrders++;
          } else {
            updateQueuedOrder(order.id, {
              status: "failed",
              retryCount: (order.retryCount || 0) + 1,
              lastError: errData?.error || `Server responded with ${res.status}`,
            });
            result.failedCount++;
            result.errors.push(`Order #${order.orderNumber}: ${errData?.error || res.status}`);
          }
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        updateQueuedOrder(order.id, {
          status: "failed",
          retryCount: (order.retryCount || 0) + 1,
          lastError: msg,
        });
        result.failedCount++;
        result.errors.push(`Order #${order.orderNumber}: ${msg}`);
      }
    }

    // 2. Process Queued Attendance
    const attendanceQueue = getQueuedAttendance();
    for (const att of attendanceQueue) {
      try {
        const action = att.payload.action === "clock_in" ? "check_in" : att.payload.action === "clock_out" ? "check_out" : att.payload.action;
        const res = await fetch("/api/v2/attendance", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        });

        if (res.ok || res.status === 400) {
          // 400 usually means already checked in/out today, which is safe to remove
          removeQueuedAttendance(att.id);
          result.syncedAttendance++;
        } else {
          result.failedCount++;
        }
      } catch (err: unknown) {
        result.failedCount++;
        result.errors.push(`Attendance sync: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // 3. Process General Mutations
    const mutations = getQueuedMutations();
    for (const mut of mutations) {
      try {
        const res = await fetch(mut.url, {
          method: mut.method,
          headers: { "Content-Type": "application/json" },
          body: mut.payload ? JSON.stringify(mut.payload) : undefined,
        });

        if (res.ok || res.status === 409) {
          removeQueuedMutation(mut.id);
          result.syncedMutations++;
        } else {
          result.failedCount++;
        }
      } catch (err: unknown) {
        result.failedCount++;
        result.errors.push(`Mutation sync: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    safeSetItem(STORAGE_KEYS.LAST_SYNC, new Date().toISOString());
  } finally {
    isCurrentlySyncing = false;
    broadcastQueueChanged();
  }

  return result;
}

/* =======================================================================
   8. EVENT LISTENERS INITIALIZATION
   ======================================================================= */

let listenersInitialized = false;

export function initOfflineSyncListeners(): void {
  if (typeof window === "undefined" || listenersInitialized) return;
  listenersInitialized = true;

  // Sync automatically when network returns
  window.addEventListener("online", () => {
    broadcastQueueChanged();
    void processOfflineQueue();
  });

  window.addEventListener("offline", () => {
    broadcastQueueChanged();
  });

  // Periodic background check if items are pending
  setInterval(() => {
    const stats = getOfflineQueueStats();
    if (stats.isOnline && stats.total > 0 && !stats.isSyncing) {
      void processOfflineQueue();
    }
  }, 25000);
}
