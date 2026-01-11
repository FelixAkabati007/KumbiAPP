import type { RefundRequest, RefundSettings } from "./types";
import { getSettings } from "./settings";
import { transactionLogger } from "./services/transaction-logger";
import { getCashDrawerService } from "./cash-drawer";

export type { RefundRequest };

export class RefundService {
  private settings: RefundSettings;

  constructor() {
    this.settings = this.getRefundSettings();
  }

  private getRefundSettings(): RefundSettings {
    // Return cached settings if available and not stale (simple memoization for now)
    if (this.settings) return this.settings;

    const appSettings = getSettings();
    return {
      enabled: appSettings.system.refunds.enabled,
      maxManagerRefund: appSettings.system.refunds.maxManagerRefund,
      requireApproval: appSettings.system.refunds.requireApproval,
      approvalThreshold: appSettings.system.refunds.approvalThreshold,
      allowedPaymentMethods: appSettings.system.refunds.allowedPaymentMethods,
      requiredFields: ["orderId", "refundAmount", "reason", "authorizedBy"],
      autoApproveSmallAmounts:
        appSettings.system.refunds.autoApproveSmallAmounts,
      smallAmountThreshold: appSettings.system.refunds.smallAmountThreshold,
      timeLimit: appSettings.system.refunds.timeLimit,
    };
  }

  // Force refresh settings (useful if settings change at runtime)
  refreshSettings() {
    this.settings = this.getRefundSettings();
  }

  async createRefundRequest(
    data: Omit<RefundRequest, "id" | "status" | "requestedAt">
  ): Promise<RefundRequest> {
    this.settings = this.getRefundSettings();

    // Validate refund request
    const validation = this.validateRefundRequest(data);
    if (!validation.isValid) {
      throw new Error(validation.error);
    }

    // Determine status logic (client-side prediction or server-side logic?)
    // For consistency with original logic, we can determine status here and send it,
    // OR move the logic to the server. The server endpoint currently sets 'pending'.
    // Let's rely on server for creation, but if we want auto-approve logic,
    // we should probably handle it here or update the server endpoint.
    // The server currently defaults to 'pending'.
    // Let's fetch the server first, then if it needs auto-approval, we update it immediately.
    // Ideally, the server should handle this logic, but for now let's keep it consistent.

    // We will send the request to server
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

    try {
      const response = await fetch("/api/refunds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Failed to create refund request");
      }

      const refundRequest = await response.json();

      // Check for auto-approval
      if (
        this.settings.autoApproveSmallAmounts &&
        data.refundAmount <= this.settings.smallAmountThreshold &&
        refundRequest.status === "pending"
      ) {
        try {
          return await this.approveRefund(
            refundRequest.id,
            "System (Auto-Approve)",
            "Auto-approved based on small amount threshold"
          );
        } catch (error) {
          console.error("Auto-approval failed:", error);
          // Return the pending request if auto-approval fails
          return refundRequest;
        }
      }

      return refundRequest;
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  validateRefundRequest(
    data: Omit<RefundRequest, "id" | "status" | "requestedAt">
  ): { isValid: boolean; error?: string } {
    if (!this.settings.enabled) {
      return { isValid: false, error: "Refunds are not enabled" };
    }
    for (const field of this.settings.requiredFields) {
      if (
        !(field in data) ||
        (data as Record<string, unknown>)[field] === undefined
      ) {
        return { isValid: false, error: `${field} is required` };
      }
    }
    if (typeof data.refundAmount !== "number" || data.refundAmount <= 0) {
      return { isValid: false, error: "Refund amount must be greater than 0" };
    }
    if (
      typeof data.originalAmount !== "number" ||
      data.refundAmount > data.originalAmount
    ) {
      return {
        isValid: false,
        error: "Refund amount cannot exceed original amount",
      };
    }
    if (!this.settings.allowedPaymentMethods.includes(data.paymentMethod)) {
      return {
        isValid: false,
        error: "Payment method not allowed for refunds",
      };
    }
    return { isValid: true };
  }

  async approveRefund(
    refundId: string,
    approvedBy: string,
    notes?: string
  ): Promise<RefundRequest> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    try {
      const response = await fetch(`/api/refunds/${refundId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "approved", approvedBy, notes }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Failed to approve refund");
      }

      return response.json();
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  async rejectRefund(
    refundId: string,
    rejectedBy: string,
    reason: string
  ): Promise<RefundRequest> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    try {
      const response = await fetch(`/api/refunds/${refundId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "rejected",
          approvedBy: rejectedBy,
          notes: reason,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Failed to reject refund");
      }

      return response.json();
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  async processRefund(
    refundId: string,
    refundMethod: string,
    transactionId?: string
  ): Promise<RefundRequest> {
    // 1. Fetch current state to ensure it's approved
    const current = await this.getRefundById(refundId);
    if (!current) throw new Error("Refund not found");
    if (current.status !== "approved")
      throw new Error("Refund must be approved first");

    const targetTransactionId = transactionId || current.transactionId;

    try {
      if (refundMethod === "mobile") {
        throw new Error("Non-cash refunds are unsupported");
      } else if (refundMethod === "cash") {
        const cashDrawer = getCashDrawerService();
        await cashDrawer.open();
      }

      // Update status in DB
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);

      try {
        const response = await fetch(`/api/refunds/${refundId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            status: "completed",
            refundMethod,
            transactionId: targetTransactionId,
          }),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error("Failed to update refund status");
        }

        const updatedRefund = await response.json();

        await transactionLogger.logTransaction({
          id: `REF-${updatedRefund.id}`,
          type: "refund",
          orderId: updatedRefund.orderId,
          amount: updatedRefund.refundAmount,
          status: "success",
          timestamp: new Date().toISOString(),
          metadata: {
            refundMethod,
            originalTransactionId: targetTransactionId,
          },
          paymentMethod: refundMethod,
        });

        return updatedRefund;
      } catch (error) {
        console.error("Refund processing error:", error);
        await transactionLogger.logTransaction({
          id: `FAIL-REF-${refundId}`,
          type: "refund",
          orderId: current.orderId,
          amount: current.refundAmount,
          status: "failed",
          timestamp: new Date().toISOString(),
          metadata: {
            error: error instanceof Error ? error.message : "Refund failed",
          },
          paymentMethod: refundMethod,
        });
        throw error;
      }
    } catch (error) {
      throw error;
    }
  }

  async getRefunds(filters?: {
    id?: string;
    orderId?: string;
    status?: string;
    search?: string;
    startDate?: string;
    endDate?: string;
    limit?: number;
    offset?: number;
  }): Promise<RefundRequest[]> {
    // Check for online status to avoid console errors
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      return [];
    }

    const queryParams = new URLSearchParams();
    if (filters?.id) queryParams.append("id", filters.id);
    if (filters?.orderId) queryParams.append("orderId", filters.orderId);
    if (filters?.status) queryParams.append("status", filters.status);
    if (filters?.search) queryParams.append("search", filters.search);
    if (filters?.startDate) queryParams.append("startDate", filters.startDate);
    if (filters?.endDate) queryParams.append("endDate", filters.endDate);
    if (filters?.limit) queryParams.append("limit", filters.limit.toString());
    if (filters?.offset)
      queryParams.append("offset", filters.offset.toString());

    const queryString = queryParams.toString();
    const url = queryString ? `/api/refunds?${queryString}` : "/api/refunds";

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          return [];
        }
        throw new Error(`Failed to fetch refunds: ${response.statusText}`);
      }
      const data = await response.json();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return data.map((r: any) => ({
        ...r,
        requestedAt: new Date(r.requestedat),
        approvedAt: r.approvedat ? new Date(r.approvedat) : undefined,
        completedAt: r.completedat ? new Date(r.completedat) : undefined,
        orderId: r.orderid,
        orderNumber: r.ordernumber,
        customerName: r.customername,
        originalAmount: parseFloat(r.originalamount),
        refundAmount: parseFloat(r.refundamount),
        paymentMethod: r.paymentmethod,
        authorizedBy: r.authorizedby,
        additionalNotes: r.additionalnotes,
        requestedBy: r.requestedby,
        refundMethod: r.refundmethod,
        transactionId: r.transactionid,
      }));
    } catch (error: unknown) {
      if (error instanceof Error) {
        if (error.name === "AbortError") return [];
        if (
          error.message?.includes("Unauthorized") ||
          error.message?.includes("Forbidden")
        ) {
          return [];
        }
      }
      // Suppress logging for common network aborts/failures that are transient
      if (
        error instanceof Error &&
        (error.message.includes("Failed to fetch") ||
          error.message.includes("NetworkError") ||
          error.message.includes("ERR_ABORTED"))
      ) {
        // console.warn("Suppressed network error fetching refunds:", error.message);
        throw error;
      }
      console.error("Error fetching refunds:", error);
      throw error;
    }
  }

  async getRefundById(refundId: string): Promise<RefundRequest | undefined> {
    const refunds = await this.getRefunds({ id: refundId });
    return refunds[0];
  }

  async getRefundsByStatus(
    status: RefundRequest["status"]
  ): Promise<RefundRequest[]> {
    return this.getRefunds({ status });
  }

  async getRefundsByOrderId(orderId: string): Promise<RefundRequest[]> {
    return this.getRefunds({ orderId });
  }

  canApproveRefunds(userRole: string, refundAmount: number): boolean {
    if (userRole === "admin") return true;
    if (userRole === "Restaurant Manager") {
      return refundAmount <= this.settings.maxManagerRefund;
    }
    return false;
  }

  async getRefundStats(): Promise<{
    total: number;
    pending: number;
    approved: number;
    rejected: number;
    completed: number;
    totalAmount: number;
  }> {
    const refunds = await this.getRefunds();
    const stats = {
      total: refunds.length,
      pending: 0,
      approved: 0,
      rejected: 0,
      completed: 0,
      totalAmount: 0,
    };

    refunds.forEach((refund) => {
      if (stats[refund.status] !== undefined) {
        stats[refund.status]++;
      }
      if (refund.status === "completed") {
        stats.totalAmount += refund.refundAmount;
      }
    });

    return stats;
  }
}

export const refundService = new RefundService();

// Helper functions for backward compatibility (but async now)
export const getRefunds = async (
  filters?: Parameters<RefundService["getRefunds"]>[0]
) => refundService.getRefunds(filters);
export const getRefundStats = async () => refundService.getRefundStats();
export const getRefundService = () => refundService;
export const createRefundRequest = async (
  data: Omit<RefundRequest, "id" | "status" | "requestedAt">
) => refundService.createRefundRequest(data);
