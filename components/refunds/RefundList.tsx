import React, { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DollarSign,
  Search,
  Filter,
  CheckCircle,
  XCircle,
  Clock,
  Eye,
  CreditCard,
  User,
  FileText,
} from "lucide-react";
import { RefundRequest } from "@/lib/refund-service";

interface RefundListProps {
  refunds: RefundRequest[];
  onProcess: (refund: RefundRequest) => void;
  onApprove: (refund: RefundRequest) => void;
  onReject: (refund: RefundRequest) => void;
  onView: (refund: RefundRequest) => void;
}

export function RefundList({
  refunds,
  onProcess,
  onApprove,
  onReject,
  onView,
}: RefundListProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [dateFilter, setDateFilter] = useState<string>("all");

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
    <div className="space-y-4">
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
                              Reason: {refund.additionalNotes}
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
                      onClick={() => onView(refund)}
                      className="rounded-2xl border-orange-200 dark:border-orange-700 hover:bg-orange-50 dark:hover:bg-orange-900/20 text-orange-700 dark:text-orange-300"
                    >
                      <Eye className="h-4 w-4" />
                    </Button>

                    {refund.status === "pending" && (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => onApprove(refund)}
                          className="rounded-2xl border-green-200 dark:border-green-700 hover:bg-green-50 dark:hover:bg-green-900/20 text-green-700 dark:text-green-300"
                        >
                          <CheckCircle className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => onReject(refund)}
                          className="rounded-2xl border-red-200 dark:border-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 text-red-700 dark:text-red-300"
                        >
                          <XCircle className="h-4 w-4" />
                        </Button>
                      </>
                    )}

                    {refund.status === "approved" && (
                      <Button
                        size="sm"
                        onClick={() => onProcess(refund)}
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
    </div>
  );
}
