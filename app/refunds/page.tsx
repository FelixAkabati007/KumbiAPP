"use client";

import dynamic from "next/dynamic";
import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  getRefunds,
  getRefundStats,
  getRefundService,
  type RefundRequest,
} from "@/lib/refund-service";
import { useAuth } from "@/components/auth-provider";
import { RefundRequestDialog } from "@/components/refund-request-dialog";
import { RoleGuard } from "@/components/role-guard";
import { LogoDisplay } from "@/components/logo-display";
import { ArrowLeft, DollarSign, Plus, RefreshCw, Loader2 } from "lucide-react";

const RefundStats = dynamic(
  () =>
    import("@/components/refunds/RefundStats").then((mod) => mod.RefundStats),
  {
    loading: () => (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="h-32 animate-pulse bg-gray-100 dark:bg-gray-800 rounded-3xl"
          />
        ))}
      </div>
    ),
  }
);

const RefundList = dynamic(
  () => import("@/components/refunds/RefundList").then((mod) => mod.RefundList),
  {
    loading: () => (
      <div className="h-96 animate-pulse bg-gray-100 dark:bg-gray-800 rounded-3xl" />
    ),
  }
);

function RefundsPageContent() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [refunds, setRefunds] = useState<RefundRequest[]>([]);
  const [stats, setStats] = useState({
    total: 0,
    pending: 0,
    approved: 0,
    rejected: 0,
    completed: 0,
    totalAmount: 0,
  });
  const [isLoading, setIsLoading] = useState(false);

  // Filter states
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("all");

  // Dialog states
  const [refundDialogOpen, setRefundDialogOpen] = useState(false);
  const [selectedRefund, setSelectedRefund] = useState<RefundRequest | null>(
    null
  );
  const [approvalDialogOpen, setApprovalDialogOpen] = useState(false);
  const [rejectionDialogOpen, setRejectionDialogOpen] = useState(false);
  const [approvalNotes, setApprovalNotes] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");

  // Load refunds on component mount
  const loadRefunds = useCallback(async () => {
    setIsLoading(true);
    try {
      const filters: Parameters<typeof getRefunds>[0] = {};

      if (searchTerm) filters.search = searchTerm;
      if (statusFilter !== "all") filters.status = statusFilter;

      if (dateFilter !== "all") {
        const now = new Date();
        const start = new Date();
        if (dateFilter === "today") {
          start.setHours(0, 0, 0, 0);
        } else if (dateFilter === "week") {
          start.setDate(now.getDate() - 7);
        } else if (dateFilter === "month") {
          start.setMonth(now.getMonth() - 1);
        }
        filters.startDate = start.toISOString();
      }

      const allRefunds = await getRefunds(filters);
      setRefunds(allRefunds);

      // Stats should arguably reflect global state, not filtered state
      // But currently getRefundStats doesn't take filters.
      // We'll keep it as is.
      const newStats = await getRefundStats();
      setStats(newStats);
      return true;
    } catch (error) {
      console.error("Failed to load refunds:", error);
      toast({
        title: "Error",
        description: "Failed to load refunds data",
        variant: "destructive",
      });
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [toast, searchTerm, statusFilter, dateFilter]);

  const handleRefresh = async () => {
    if (isLoading) return;
    const success = await loadRefunds();
    if (success) {
      toast({
        title: "Refreshed",
        description: "Refund list updated successfully",
      });
    }
  };

  useEffect(() => {
    // Debounce search
    const timer = setTimeout(() => {
      loadRefunds();
    }, 500);
    return () => clearTimeout(timer);
  }, [loadRefunds]);

  // Notify manager/admin if new pending refund appears
  useEffect(() => {
    if (!user) return;
    if (user.role === "admin" || user.role === "Restaurant Manager") {
      const pendingCount = refunds.filter((r) => r.status === "pending").length;
      if (pendingCount > 0) {
        toast({
          title: "Pending Refund Approval",
          description: `You have ${pendingCount} refund request(s) awaiting your approval.`,
          variant: "default",
        });
      }
    }
  }, [refunds, user, toast]);

  // Handle refund approval
  const handleApproveRefund = async () => {
    if (!selectedRefund) return;

    setIsLoading(true);
    try {
      const service = getRefundService();
      await service.approveRefund(
        selectedRefund.id,
        user?.name || "Unknown User",
        approvalNotes
      );

      toast({
        title: "Refund Approved",
        description: "Refund request has been approved successfully",
      });

      loadRefunds();
      setApprovalDialogOpen(false);
      setSelectedRefund(null);
      setApprovalNotes("");
    } catch {
      toast({
        title: "Error",
        description: "Failed to approve refund request",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Handle refund rejection
  const handleRejectRefund = async () => {
    if (!selectedRefund) return;

    setIsLoading(true);
    try {
      const service = getRefundService();
      await service.rejectRefund(
        selectedRefund.id,
        user?.name || "Unknown User",
        rejectionReason
      );

      toast({
        title: "Refund Rejected",
        description: "Refund request has been rejected",
      });

      loadRefunds();
      setRejectionDialogOpen(false);
      setSelectedRefund(null);
      setRejectionReason("");
    } catch {
      toast({
        title: "Error",
        description: "Failed to reject refund request",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Handle refund processing
  const handleProcessRefund = async (refund: RefundRequest) => {
    setIsLoading(true);
    try {
      const service = getRefundService();
      await service.processRefund(refund.id, refund.paymentMethod);

      toast({
        title: "Refund Processed",
        description: "Refund has been processed successfully",
      });

      loadRefunds();
    } catch {
      toast({
        title: "Error",
        description: "Failed to process refund",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen w-full flex-col bg-gradient-to-br from-orange-50 via-amber-50 to-yellow-100 dark:from-orange-950 dark:via-amber-950 dark:to-yellow-950">
      <header className="sticky top-0 z-10 flex h-16 items-center gap-2 sm:gap-4 border-b bg-white/80 dark:bg-gray-900/80 backdrop-blur-md px-2 sm:px-4 md:px-6 border-orange-200 dark:border-orange-700">
        <div className="flex items-center gap-2 sm:gap-3">
          <LogoDisplay size="md" />
          <Link
            href="/"
            className="flex items-center gap-1 sm:gap-2 hover:opacity-80 transition-opacity"
          >
            <ArrowLeft className="h-4 w-4 sm:h-5 sm:w-5 flex-shrink-0 text-orange-600 dark:text-orange-400" />
            <DollarSign className="h-4 w-4 sm:h-6 sm:w-6 flex-shrink-0 text-orange-600 dark:text-orange-400" />
            <h1 className="text-sm sm:text-lg font-semibold truncate max-w-[120px] sm:max-w-none text-gray-800 dark:text-gray-200">
              Refund Management
            </h1>
          </Link>
        </div>

        <div className="ml-auto flex items-center gap-1 sm:gap-2">
          <Button
            variant="outline"
            onClick={handleRefresh}
            disabled={isLoading}
            aria-label="Refresh refund list"
            aria-busy={isLoading}
            className="hidden sm:flex bg-white/50 dark:bg-gray-800/50 border-orange-200 dark:border-orange-700 hover:bg-orange-50 dark:hover:bg-orange-900/20 text-orange-700 dark:text-orange-300 transition-all duration-200"
          >
            {isLoading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Refresh
          </Button>
          <Button
            onClick={() => setRefundDialogOpen(true)}
            size="sm"
            className="bg-gradient-to-r from-orange-500 via-amber-500 to-yellow-500 hover:from-orange-600 hover:via-amber-600 hover:to-yellow-600 text-white shadow-lg relative overflow-hidden"
          >
            <Plus className="mr-2 h-4 w-4" />
            <span className="hidden sm:inline">New Refund</span>
          </Button>
        </div>
      </header>

      <main className="flex flex-1 flex-col p-2 sm:p-4 md:p-6">
        <RefundStats stats={stats} />
        <RefundList
          refunds={refunds}
          onView={(refund) => setSelectedRefund(refund)}
          onApprove={(refund) => {
            setSelectedRefund(refund);
            setApprovalDialogOpen(true);
          }}
          onReject={(refund) => {
            setSelectedRefund(refund);
            setRejectionDialogOpen(true);
          }}
          onProcess={handleProcessRefund}
          searchTerm={searchTerm}
          statusFilter={statusFilter}
          dateFilter={dateFilter}
          onSearchChange={setSearchTerm}
          onStatusChange={setStatusFilter}
          onDateChange={setDateFilter}
        />
      </main>

      {/* Refund Request Dialog */}
      <RefundRequestDialog
        open={refundDialogOpen}
        onOpenChange={setRefundDialogOpen}
      />

      {/* Approval Dialog */}
      <Dialog open={approvalDialogOpen} onOpenChange={setApprovalDialogOpen}>
        <DialogContent className="sm:max-w-md bg-white/90 dark:bg-gray-800/90 backdrop-blur-md border border-orange-200 dark:border-orange-700 rounded-3xl">
          <DialogHeader>
            <DialogTitle className="text-orange-800 dark:text-orange-200">
              Approve Refund Request
            </DialogTitle>
            <DialogDescription className="text-orange-600 dark:text-orange-400">
              Are you sure you want to approve this refund request?
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label
                htmlFor="approvalNotes"
                className="text-sm text-gray-700 dark:text-gray-300"
              >
                Approval Notes (Optional)
              </Label>
              <Textarea
                id="approvalNotes"
                value={approvalNotes}
                onChange={(e) => setApprovalNotes(e.target.value)}
                placeholder="Add any notes about this approval..."
                className="rounded-2xl border-orange-200 dark:border-orange-700 focus:border-orange-500 dark:focus:border-orange-400 bg-white/50 dark:bg-gray-800/50"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setApprovalDialogOpen(false)}
              className="rounded-2xl border-orange-200 dark:border-orange-700 hover:bg-orange-50 dark:hover:bg-orange-900/20 text-orange-700 dark:text-orange-300"
            >
              Cancel
            </Button>
            <Button
              onClick={handleApproveRefund}
              disabled={isLoading}
              className="rounded-2xl bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white"
            >
              {isLoading ? "Approving..." : "Approve Refund"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rejection Dialog */}
      <Dialog open={rejectionDialogOpen} onOpenChange={setRejectionDialogOpen}>
        <DialogContent className="sm:max-w-md bg-white/90 dark:bg-gray-800/90 backdrop-blur-md border border-orange-200 dark:border-orange-700 rounded-3xl">
          <DialogHeader>
            <DialogTitle className="text-orange-800 dark:text-orange-200">
              Reject Refund Request
            </DialogTitle>
            <DialogDescription className="text-orange-600 dark:text-orange-400">
              Please provide a reason for rejecting this refund request.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label
                htmlFor="rejectionReason"
                className="text-sm text-gray-700 dark:text-gray-300"
              >
                Rejection Reason
              </Label>
              <Textarea
                id="rejectionReason"
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="Why is this request being rejected?"
                className="rounded-2xl border-orange-200 dark:border-orange-700 focus:border-orange-500 dark:focus:border-orange-400 bg-white/50 dark:bg-gray-800/50"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRejectionDialogOpen(false)}
              className="rounded-2xl border-orange-200 dark:border-orange-700 hover:bg-orange-50 dark:hover:bg-orange-900/20 text-orange-700 dark:text-orange-300"
            >
              Cancel
            </Button>
            <Button
              onClick={handleRejectRefund}
              disabled={isLoading || !rejectionReason.trim()}
              className="rounded-2xl bg-gradient-to-r from-red-500 to-pink-500 hover:from-red-600 hover:to-pink-600 text-white"
            >
              {isLoading ? "Rejecting..." : "Reject Refund"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function RefundsPage() {
  return (
    <RoleGuard section="refunds">
      <RefundsPageContent />
    </RoleGuard>
  );
}
