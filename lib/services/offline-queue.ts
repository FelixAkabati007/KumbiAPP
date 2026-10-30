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

  private constructor() {
    if (typeof window !== "undefined") {
      this.loadQueue().then(() => {
        if (navigator.onLine) this.processQueue();
      });
      window.addEventListener("online", () => this.processQueue());
      setInterval(() => this.processQueue(), 30000);
    }
  }

  static getInstance(): OfflineQueueService {
    if (!OfflineQueueService.instance) {
      OfflineQueueService.instance = new OfflineQueueService();
    }
    return OfflineQueueService.instance;
  }

  private async loadQueue(): Promise<void> {
    try {
      const db = await openIdb();
      if (!db) return;
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => {
        if (Array.isArray(req.result)) {
          this.queue = req.result;
        }
      };
    } catch {
      // In-memory fallback
    }
  }

  private async saveQueue(): Promise<void> {
    try {
      const db = await openIdb();
      if (!db) return;
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      store.clear();
      for (const item of this.queue) {
        store.put(item);
      }
    } catch {
      // In-memory fallback
    }
  }

  async enqueue(url: string, method: string, body: unknown) {
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
      this.processQueue();
    }
  }

  async processQueue() {
    if (this.isProcessing || this.queue.length === 0 || (typeof navigator !== "undefined" && !navigator.onLine))
      return;

    this.isProcessing = true;
    const remainingQueue: QueuedRequest[] = [];

    for (const req of this.queue) {
      try {
        const response = await fetch(req.url, {
          method: req.method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(req.body),
        });

        if (!response.ok) {
          throw new Error(`Server returned ${response.status}`);
        }
      } catch (error) {
        console.error(`Failed to process queued request ${req.id}`, error);
        req.retryCount++;
        if (req.retryCount < MAX_RETRIES) {
          remainingQueue.push(req);
        } else {
          console.error(`Request ${req.id} failed max retries, dropping.`);
        }
      }
    }

    this.queue = remainingQueue;
    await this.saveQueue();
    this.isProcessing = false;
  }

  getQueueLength(): number {
    return this.queue.length;
  }

  getQueue(): readonly QueuedRequest[] {
    return this.queue;
  }
}

export const offlineQueue = OfflineQueueService.getInstance();
