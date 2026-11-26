export interface QueuedRequest {
  id: string;
  url: string;
  method: string;
  body: unknown;
  timestamp: number;
  retryCount: number;
}

const MAX_RETRIES = 5;
const DB_NAME = "khhrest_offline_db";
const STORE_NAME = "offline_requests";

function openIdb(): Promise<IDBDatabase | null> {
  if (typeof window === "undefined" || !window.indexedDB) return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const request = window.indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: "id" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export class OfflineQueueService {
  private static instance: OfflineQueueService;
  private queue: QueuedRequest[] = [];
  private isProcessing = false;
  private isLoaded = false;
  private loadPromise: Promise<void> | null = null;

  private constructor() {
    if (typeof window !== "undefined") {
      this.ensureLoaded().then(() => {
        if (navigator.onLine) void this.processQueue();
      });
      window.addEventListener("online", () => {
        setTimeout(() => void this.processQueue(), 1000);
      });
      setInterval(() => void this.processQueue(), 25000);
    }
  }

  static getInstance(): OfflineQueueService {
    if (!OfflineQueueService.instance) {
      OfflineQueueService.instance = new OfflineQueueService();
    }
    return OfflineQueueService.instance;
  }

  private async ensureLoaded(): Promise<void> {
    if (this.isLoaded) return;
    if (this.loadPromise) return this.loadPromise;

    this.loadPromise = (async () => {
      try {
        const db = await openIdb();
        if (!db) {
          this.isLoaded = true;
          return;
        }
        await new Promise<void>((resolve) => {
          try {
            const tx = db.transaction(STORE_NAME, "readonly");
            const store = tx.objectStore(STORE_NAME);
            const req = store.getAll();
            req.onsuccess = () => {
              if (Array.isArray(req.result)) {
                this.queue = req.result;
              }
              this.isLoaded = true;
              resolve();
            };
            req.onerror = () => {
              this.isLoaded = true;
              resolve();
            };
          } catch {
            this.isLoaded = true;
            resolve();
          }
        });
      } catch {
        this.isLoaded = true;
        // In-memory fallback
      }
    })();

    return this.loadPromise;
  }

  private async saveQueue(): Promise<void> {
    try {
      const db = await openIdb();
      if (!db) return;
      await new Promise<void>((resolve) => {
        try {
          const tx = db.transaction(STORE_NAME, "readwrite");
          const store = tx.objectStore(STORE_NAME);
          store.clear();
          for (const item of this.queue) {
            store.put(item);
          }
          tx.oncomplete = () => resolve();
          tx.onerror = () => resolve();
        } catch {
          resolve();
        }
      });
    } catch {
      // In-memory fallback
    }
  }

  async enqueue(url: string, method: string, body: unknown): Promise<void> {
    await this.ensureLoaded();
    const request: QueuedRequest = {
      id: `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      url,
      method,
      body,
      timestamp: Date.now(),
      retryCount: 0,
    };
    this.queue.push(request);
    await this.saveQueue();

    if (typeof navigator !== "undefined" && navigator.onLine) {
      void this.processQueue();
    }
  }

  async processQueue(): Promise<{ processed: number; remaining: number }> {
    await this.ensureLoaded();
    if (this.isProcessing || this.queue.length === 0 || (typeof navigator !== "undefined" && !navigator.onLine)) {
      return { processed: 0, remaining: this.queue.length };
    }

    this.isProcessing = true;
    const remainingQueue: QueuedRequest[] = [];
    let processedCount = 0;

    for (const req of this.queue) {
      try {
        const response = await fetch(req.url, {
          method: req.method,
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": req.id,
            "X-Offline-Sync": "true",
          },
          body: req.body ? JSON.stringify(req.body) : undefined,
        });

        if (response.ok) {
          processedCount++;
        } else if (response.status === 409) {
          const errPayload = await response.json().catch(() => null);
          const errText = String(errPayload?.error || errPayload?.code || "").toLowerCase();
          const isOrderEndpoint = req.url.includes("/api/orders");
          if (
            !isOrderEndpoint ||
            errText.includes("already exists") ||
            errText.includes("duplicate") ||
            errText.includes("idempotent")
          ) {
            processedCount++;
          } else {
            throw new Error(errPayload?.error || `Conflict 409 on ${req.url}`);
          }
        } else {
          const errPayload = await response.json().catch(() => null);
          throw new Error(errPayload?.error || `Server returned ${response.status}`);
        }
      } catch (error) {
        console.error(`[OfflineQueueService] Failed request ${req.id} to ${req.url}:`, error);
        req.retryCount++;
        const isCriticalOrder = req.url.includes("/api/orders") || req.url.includes("/api/transactions");
        if (isCriticalOrder || req.retryCount < MAX_RETRIES) {
          remainingQueue.push(req);
        } else {
          console.error(`[OfflineQueueService] Request ${req.id} exceeded max retries, dropping.`);
        }
      }
    }

    this.queue = remainingQueue;
    await this.saveQueue();
    this.isProcessing = false;
    return { processed: processedCount, remaining: this.queue.length };
  }

  getQueueLength(): number {
    return this.queue.length;
  }

  getQueue(): readonly QueuedRequest[] {
    return this.queue;
  }

  async clearQueue(): Promise<void> {
    this.queue = [];
    await this.saveQueue();
  }
}

export const offlineQueue = OfflineQueueService.getInstance();
