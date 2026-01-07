import type { TransactionLog } from "../types/payment";
import { offlineQueue } from "./offline-queue";

class TransactionLogger {
  private static instance: TransactionLogger;

  private constructor() {}

  static getInstance(): TransactionLogger {
    if (!TransactionLogger.instance) {
      TransactionLogger.instance = new TransactionLogger();
    }
    return TransactionLogger.instance;
  }

  async logTransaction(log: TransactionLog): Promise<void> {
    try {
      console.info(`[TransactionLog] ${log.type.toUpperCase()}:`, {
        orderId: log.orderId,
        amount: log.amount,
        status: log.status,
        timestamp: log.timestamp,
      });

      // Store in local storage as fallback
      this.storeLog(log);

      // Persist to database
      await this.persistTransaction(log);

      // If critical error, alert monitoring system
      if (log.status === "error" || log.status === "failed") {
        await this.alertMonitoring(log);
      }
    } catch (error) {
      console.error("Failed to log transaction:", error);
    }
  }

  private async persistTransaction(log: TransactionLog): Promise<void> {
    try {
      const response = await fetch("/api/transactions/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(log),
      });

      if (!response.ok) {
        throw new Error(`Server returned ${response.status}`);
      }
    } catch (error) {
      console.error(
        "Failed to persist transaction to DB, queuing for retry:",
        error,
      );
      await offlineQueue.enqueue("/api/transactions/log", "POST", log);
    }
  }

  private storeLog(log: TransactionLog): void {
    try {
      if (typeof window === "undefined") return;
      const logs = JSON.parse(localStorage.getItem("transaction_logs") || "[]");
      logs.unshift(log);
      localStorage.setItem(
        "transaction_logs",
        JSON.stringify(logs.slice(0, 100)),
      ); // Keep last 100 logs
    } catch (error) {
      console.error("Logging failed:", error);
    }
  }

  private async alertMonitoring(log: TransactionLog): Promise<void> {
    const alertData = {
      level: log.status === "error" ? "error" : "warning",
      message: `Transaction ${log.status}: ${log.type} - Order ${log.orderId}`,
      context: {
        orderId: log.orderId,
        amount: log.amount,
        timestamp: log.timestamp,
        metadata: log.metadata,
      },
    };

    // Send alert to monitoring service
    try {
      const response = await fetch("/api/monitoring/alert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(alertData),
      });

      if (!response.ok) {
        throw new Error(`Server returned ${response.status}`);
      }
    } catch (error) {
      console.error(
        "Failed to send monitoring alert, queuing for retry:",
        error,
      );
      await offlineQueue.enqueue("/api/monitoring/alert", "POST", alertData);
    }
  }
}

export const transactionLogger = TransactionLogger.getInstance();
