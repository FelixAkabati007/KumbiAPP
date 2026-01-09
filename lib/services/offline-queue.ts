export interface QueuedRequest {
  id: string;
  url: string;
  method: string;
  body: unknown;
  timestamp: number;
  retryCount: number;
}

const MAX_RETRIES = 5;

export class OfflineQueueService {
  private static instance: OfflineQueueService;
  private queue: QueuedRequest[] = [];
  private isProcessing = false;

  private constructor() {
    // In-memory queue only for Neon-only mode.
    // No localStorage loading.

    // Try to process queue on startup and when online status changes
    if (typeof window !== "undefined") {
      window.addEventListener("online", () => this.processQueue());
      // Process periodically
      setInterval(() => this.processQueue(), 60000);
    }
  }

  static getInstance(): OfflineQueueService {
    if (!OfflineQueueService.instance) {
      OfflineQueueService.instance = new OfflineQueueService();
    }
    return OfflineQueueService.instance;
  }

  private loadQueue() {
    // LocalStorage persistence removed.
    this.queue = [];
  }

  private saveQueue() {
    // LocalStorage persistence removed.
    // Queue is in-memory only.
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
    this.saveQueue();

    // Try to process immediately if online
    if (navigator.onLine) {
      this.processQueue();
    }
  }

  async processQueue() {
    if (this.isProcessing || this.queue.length === 0 || !navigator.onLine)
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

        // Success: do not add back to remainingQueue
        console.log(`Processed queued request: ${req.id}`);
      } catch (error) {
        console.error(`Failed to process queued request ${req.id}`, error);
        req.retryCount++;
        if (req.retryCount < MAX_RETRIES) {
          remainingQueue.push(req);
        } else {
          console.error(`Request ${req.id} failed max retries, dropping.`);
          // Optionally move to a "dead letter" queue
        }
      }
    }

    this.queue = remainingQueue;
    this.saveQueue();
    this.isProcessing = false;
  }

  getQueueLength(): number {
    return this.queue.length;
  }
}

export const offlineQueue = OfflineQueueService.getInstance();
