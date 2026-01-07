"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
// Removed unused getSettings import
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
import {
  ArrowLeft,
  DollarSign,
  Search,
  Filter,
  Plus,
  CheckCircle,
  XCircle,
  Clock,
  Eye,
  RefreshCw,
  User,
  CreditCard,
  FileText,
} from "lucide-react";
// Removed unused AuthProvider import

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
  // Removed unused settings state

  // Filter states
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [dateFilter, setDateFilter] = useState<string>("all");

  // Dialog states
  const [refundDialogOpen, setRefundDialogOpen] = useState(false);
  const [selectedRefund, setSelectedRefund] = useState<RefundRequest | null>(
    null,
  );
  const [approvalDialogOpen, setApprovalDialogOpen] = useState(false);
  const [rejectionDialogOpen, setRejectionDialogOpen] = useState(false);
  const [approvalNotes, setApprovalNotes] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");

  // Load refunds on component mount
  const loadRefunds = useCallback(async () => {
    setIsLoading(true);
    try {
      const allRefunds = await getRefunds();
      setRefunds(allRefunds);
      const newStats = await getRefundStats();
      setStats(newStats);
    } catch (error) {
      console.error("Failed to load refunds:", error);
      toast({
        title: "Error",
        description: "Failed to load refunds data",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadRefunds();
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

  // Filter refunds based on search and filters
  const filteredRefunds = refunds.filter((refund) => {
    const matchesSearch =
      refund.orderNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      refund.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      refund.id.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus =
      statusFilter === "all" || refund.status === statusFilter;

    const matchesDate =
      dateFilter === "all" ||
      (() => {
        const refundDate = new Date(refund.requestedAt);
        const now = new Date();
        const diffHours =
          (now.getTime() - refundDate.getTime()) / (1000 * 60 * 60);

        switch (dateFilter) {
          case "today":
            return refundDate.toDateString() === now.toDateString();
          case "week":
            return diffHours <= 168; // 7 days
          case "month":
            return diffHours <= 720; // 30 days
          default:
            return true;
        }
      })();

    return matchesSearch && matchesStatus && matchesDate;
  });

  // Handle refund approval
  const handleApproveRefund = async () => {
    if (!selectedRefund) return;

    setIsLoading(true);
    try {
      const service = getRefundService();
      await service.approveRefund(
        selectedRefund.id,
        user?.name || "Unknown User",
        approvalNotes,
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
        rejectionReason,
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

  // Get status badge
  const getStatusBadge = (status: RefundRequest["status"]) => {
    switch (status) {
      case "pending":
        return (
          <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/20 dark:text-yellow-300 dark:border-yellow-700">
            <Clock className="mr-1 h-3 w-3" />
            Pending
          </Badge>
        );
      case "approved":
        return (
          <Badge className="bg-green-100 text-green-800 border-green-200 dark:bg-green-900/20 dark:text-green-300 dark:border-green-700">
            <CheckCircle className="mr-1 h-3 w-3" />
            Approved
          </Badge>
        );
      case "rejected":
        return (
          <Badge className="bg-red-100 text-red-800 border-red-200 dark:bg-red-900/20 dark:text-red-300 dark:border-red-700">
            <XCircle className="mr-1 h-3 w-3" />
            Rejected
          </Badge>
        );
      case "completed":
        return (
          <Badge className="bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-700">
            <CheckCircle className="mr-1 h-3 w-3" />
            Completed
          </Badge>
        );
      default:
        return null;
    }
  };

  // Get payment method icon
  const getPaymentMethodIcon = (method: string) => {
    switch (method.toLowerCase()) {
      case "cash":
        return <DollarSign className="h-4 w-4" />;
      case "card":
        return <CreditCard className="h-4 w-4" />;
      case "mobile":
        return <User className="h-4 w-4" />;
      default:
        return <FileText className="h-4 w-4" />;
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
            onClick={loadRefunds}
            className="hidden sm:flex bg-white/50 dark:bg-gray-800/50 border-orange-200 dark:border-orange-700 hover:bg-orange-50 dark:hover:bg-orange-900/20 text-orange-700 dark:text-orange-300"
          >
            <RefreshCw className="mr-2 h-4 w-4" />
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
        {/* Statistics Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <Card className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm border border-orange-200 dark:border-orange-700 rounded-3xl shadow-xl">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Total Refunds
                  </p>
                  <p className="text-2xl font-bold text-gray-800 dark:text-gray-200">
                    {stats.total}
                  </p>
                </div>
                <div className="p-2 bg-gradient-to-br from-orange-500 via-amber-500 to-yellow-500 rounded-full">
                  <DollarSign className="h-6 w-6 text-white" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm border border-orange-200 dark:border-orange-700 rounded-3xl shadow-xl">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Pending
                  </p>
                  <p className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">
                    {stats.pending}
                  </p>
                </div>
                <div className="p-2 bg-yellow-500 rounded-full">
                  <Clock className="h-6 w-6 text-white" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm border border-orange-200 dark:border-orange-700 rounded-3xl shadow-xl">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Completed
                  </p>
                  <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                    {stats.completed}
                  </p>
                </div>
                <div className="p-2 bg-green-500 rounded-full">
                  <CheckCircle className="h-6 w-6 text-white" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm border border-orange-200 dark:border-orange-700 rounded-3xl shadow-xl">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Total Amount
                  </p>
                  <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                    ₵{stats.totalAmount.toFixed(2)}
                  </p>
                </div>
                <div className="p-2 bg-blue-500 rounded-full">
                  <DollarSign className="h-6 w-6 text-white" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm border border-orange-200 dark:border-orange-700 rounded-3xl shadow-xl mb-6">
          <CardContent className="p-4">
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search refunds..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 rounded-2xl border-orange-200 dark:border-orange-700 focus:border-orange-500 dark:focus:border-orange-400 bg-white/50 dark:bg-gray-800/50"
                />
              </div>

              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="rounded-2xl border-orange-200 dark:border-orange-700 focus:border-orange-500 dark:focus:border-orange-400 bg-white/50 dark:bg-gray-800/50">
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent className="rounded-2xl border-orange-200 dark:border-orange-700">
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                </SelectContent>
              </Select>

              <Select value={dateFilter} onValueChange={setDateFilter}>
                <SelectTrigger className="rounded-2xl border-orange-200 dark:border-orange-700 focus:border-orange-500 dark:focus:border-orange-400 bg-white/50 dark:bg-gray-800/50">
                  <SelectValue placeholder="Filter by date" />
                </SelectTrigger>
                <SelectContent className="rounded-2xl border-orange-200 dark:border-orange-700">
                  <SelectItem value="all">All Time</SelectItem>
                  <SelectItem value="today">Today</SelectItem>
                  <SelectItem value="week">This Week</SelectItem>
                  <SelectItem value="month">This Month</SelectItem>
                </SelectContent>
              </Select>

              <Button
                variant="outline"
                onClick={() => {
                  setSearchTerm("");
                  setStatusFilter("all");
                  setDateFilter("all");
                }}
                className="rounded-2xl border-orange-200 dark:border-orange-700 hover:bg-orange-50 dark:hover:bg-orange-900/20 text-orange-700 dark:text-orange-300"
              >
                <Filter className="mr-2 h-4 w-4" />
                Clear Filters
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Refunds List */}
        <div className="space-y-4">
          {filteredRefunds.length === 0 ? (
            <Card className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm border border-orange-200 dark:border-orange-700 rounded-3xl shadow-xl">
              <CardContent className="p-8 text-center">
                <DollarSign className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                <p className="text-gray-600 dark:text-gray-400 mb-2">
                  No refund requests found
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-500">
                  {searchTerm || statusFilter !== "all" || dateFilter !== "all"
                    ? "Try adjusting your filters"
                    : "Create your first refund request"}
                </p>
              </CardContent>
            </Card>
          ) : (
            filteredRefunds.map((refund) => (
              <Card
                key={refund.id}
                className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm border border-orange-200 dark:border-orange-700 rounded-3xl shadow-xl hover:shadow-2xl transition-shadow"
              >
                <CardContent className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-gradient-to-br from-orange-500 via-amber-500 to-yellow-500 rounded-full">
                        {getPaymentMethodIcon(refund.paymentMethod)}
                      </div>
                      <div>
                        <h3 className="font-semibold text-gray-800 dark:text-gray-200">
                          {refund.orderNumber}
                        </h3>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          {refund.customerName}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {getStatusBadge(refund.status)}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
                    <div>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Refund Amount
                      </p>
                      <p className="font-semibold text-gray-800 dark:text-gray-200">
                        ₵{refund.refundAmount.toFixed(2)}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Payment Method
                      </p>
                      <p className="font-semibold text-gray-800 dark:text-gray-200 capitalize">
                        {refund.paymentMethod}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Requested
                      </p>
                      <p className="font-semibold text-gray-800 dark:text-gray-200">
                        {new Date(refund.requestedAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                        Reason
                      </p>
                      <p className="text-sm text-gray-800 dark:text-gray-200 line-clamp-2">
                        {refund.reason}
                      </p>
                      <div className="mt-2">
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          Requested by:{" "}
                          <span className="font-medium text-gray-700 dark:text-gray-200">
                            {refund.requestedBy}
                          </span>
                        </p>
                        {refund.status === "approved" && (
                          <p className="text-xs text-green-700 dark:text-green-300 mt-1">
                            Approved by:{" "}
                            <span className="font-medium">
                              {refund.approvedBy || "-"}
                            </span>
                            {refund.additionalNotes && (
                              <span className="block text-xs text-green-800 dark:text-green-200 mt-1">
                                Note: {refund.additionalNotes}
                              </span>
                            )}
                          </p>
                        )}
                        {refund.status === "rejected" && (
                          <p className="text-xs text-red-700 dark:text-red-300 mt-1">
                            Rejected by:{" "}
                            <span className="font-medium">
                              {refund.approvedBy || "-"}
                            </span>
                            {refund.additionalNotes && (
                              <span className="block text-xs text-red-800 dark:text-red-200 mt-1">
                                Note: {refund.additionalNotes}
                              </span>
                            )}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 ml-4">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedRefund(refund)}
                        className="rounded-2xl border-orange-200 dark:border-orange-700 hover:bg-orange-50 dark:hover:bg-orange-900/20 text-orange-700 dark:text-orange-300"
                      >
                        <Eye className="h-4 w-4" />
                      </Button>

                      {refund.status === "pending" && (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSelectedRefund(refund);
                              setApprovalDialogOpen(true);
                            }}
                            className="rounded-2xl border-green-200 dark:border-green-700 hover:bg-green-50 dark:hover:bg-green-900/20 text-green-700 dark:text-green-300"
                          >
                            <CheckCircle className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSelectedRefund(refund);
                              setRejectionDialogOpen(true);
                            }}
                            className="rounded-2xl border-red-200 dark:border-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 text-red-700 dark:text-red-300"
                          >
                            <XCircle className="h-4 w-4" />
                          </Button>
                        </>
                      )}

                      {refund.status === "approved" && (
                        <Button
                          size="sm"
                          onClick={() => handleProcessRefund(refund)}
                          className="rounded-2xl bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white"
                        >
                          Process
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
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
              className="rounded-2xl border-orange-200 dark:border-orange-700 hover:bg-orange-50 dark:hover:bg-orange-900/20 text-orange-700 dark:text-orange-300 bg-transparent"
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button
              onClick={handleApproveRefund}
              disabled={isLoading}
              className="rounded-2xl bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white shadow-lg"
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
                Reason for Rejection *
              </Label>
              <Textarea
                id="rejectionReason"
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="Explain why this refund request is being rejected..."
                className="rounded-2xl border-orange-200 dark:border-orange-700 focus:border-orange-500 dark:focus:border-orange-400 bg-white/50 dark:bg-gray-800/50"
                required
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRejectionDialogOpen(false)}
              className="rounded-2xl border-orange-200 dark:border-orange-700 hover:bg-orange-50 dark:hover:bg-orange-900/20 text-orange-700 dark:text-orange-300 bg-transparent"
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button
              onClick={handleRejectRefund}
              disabled={isLoading || !rejectionReason.trim()}
              className="rounded-2xl bg-gradient-to-r from-red-500 to-rose-500 hover:from-red-600 hover:to-rose-600 text-white shadow-lg"
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
