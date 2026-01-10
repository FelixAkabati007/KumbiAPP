"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { getSettings } from "@/lib/settings";
import { createRefundRequest } from "@/lib/refund-service";
import { useAuth } from "@/components/auth-provider";
import { CheckCircle, Clock, DollarSign, Loader2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";

interface RefundRequestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderData?: {
    orderId: string;
    orderNumber: string;
    customerName: string;
    customerRefused?: boolean;
    total: number;
    paymentMethod: string;
    date: string;
  };
}

export function RefundRequestDialog({
  open,
  onOpenChange,
  orderData,
}: RefundRequestDialogProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isVerified, setIsVerified] = useState(!!orderData);
  const [settings] = useState(getSettings());

  // Form state
  const [formData, setFormData] = useState({
    orderId: "",
    orderNumber: "",
    customerName: "",
    customerRefused: false,
    originalAmount: 0,
    refundAmount: 0,
    paymentMethod: "",
    reason: "",
    authorizedBy: "",
    additionalNotes: "",
  });

  // Validation state
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Initialize form when order data is provided
  useEffect(() => {
    if (orderData) {
      setFormData({
        orderId: orderData.orderId,
        orderNumber: orderData.orderNumber,
        customerName: orderData.customerName,
        customerRefused: orderData.customerRefused ?? false,
        originalAmount: orderData.total,
        refundAmount: orderData.total,
        paymentMethod: orderData.paymentMethod,
        reason: "",
        authorizedBy:
          user?.role === "admin"
            ? "Admin"
            : user?.role === "manager"
              ? "Restaurant Manager"
              : "",
        additionalNotes: "",
      });
      setIsVerified(true);
    } else {
      setIsVerified(false);
    }
  }, [orderData, user?.role]);

  const handleVerifyOrder = async () => {
    if (!formData.orderNumber && !formData.orderId) {
      toast({
        title: "Missing Information",
        description: "Please enter Order ID or Order Number to verify.",
        variant: "destructive",
      });
      return;
    }

    setIsVerifying(true);
    setErrors({});

    try {
      const params = new URLSearchParams();
      if (formData.orderNumber)
        params.append("orderNumber", formData.orderNumber);
      if (formData.orderId) params.append("orderId", formData.orderId);

      const res = await fetch(`/api/transactions?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to verify order");

      const transactions = await res.json();

      if (!Array.isArray(transactions) || transactions.length === 0) {
        throw new Error(
          "Order not found. Please check the Order ID/Number and try again."
        );
      }

      // Use the first match
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const txn: any = transactions[0];
      const metadata = txn.metadata || {};

      // Parse amount
      const amount =
        typeof txn.amount === "string" ? parseFloat(txn.amount) : txn.amount;

      setFormData((prev) => ({
        ...prev,
        orderId: metadata.orderId || txn.transaction_id || prev.orderId,
        orderNumber: metadata.orderNumber || prev.orderNumber,
        customerName:
          metadata.customerName || metadata.customer_name || "Guest",
        customerRefused: !!metadata.customerRefused,
        originalAmount: amount,
        refundAmount: 0,
        paymentMethod: txn.payment_method || prev.paymentMethod,
      }));

      setIsVerified(true);
      toast({
        title: "Order Verified",
        description: `Order found with amount ₵${amount.toFixed(2)}`,
      });
    } catch (error) {
      console.error(error);
      setIsVerified(false);
      toast({
        title: "Verification Failed",
        description:
          error instanceof Error
            ? error.message
            : "Could not verify order details",
        variant: "destructive",
      });
      setFormData((prev) => ({ ...prev, originalAmount: 0 }));
    } finally {
      setIsVerifying(false);
    }
  };

  // Validate form
  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.orderId) {
      newErrors.orderId = "Order ID is required";
    }

    if (!formData.customerRefused && !formData.customerName) {
      newErrors.customerName = "Customer name is required unless refused";
    }

    if (!formData.refundAmount || formData.refundAmount <= 0) {
      newErrors.refundAmount = "Refund amount must be greater than 0";
    } else if (formData.refundAmount > formData.originalAmount) {
      newErrors.refundAmount = "Refund amount cannot exceed original amount";
    }

    if (!formData.paymentMethod) {
      newErrors.paymentMethod = "Payment method is required";
    }

    if (!formData.reason.trim()) {
      newErrors.reason = "Reason for refund is required";
    }

    if (!formData.authorizedBy) {
      newErrors.authorizedBy = "Authorized by is required";
    }

    // Check manager limits
    if (
      user?.role === "manager" &&
      formData.refundAmount > settings.system.refunds.maxManagerRefund
    ) {
      newErrors.refundAmount = `Manager can only approve refunds up to ₵${settings.system.refunds.maxManagerRefund}`;
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Handle form submission
  const handleSubmit = async () => {
    if (!validateForm()) {
      // Show a toast summarizing validation errors
      const errorList = Object.values(errors).filter(Boolean).join("; ");
      toast({
        title: "Form Incomplete",
        description: errorList || "Please fill all required fields correctly.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      let refundRequest;
      try {
        refundRequest = await createRefundRequest({
          ...formData,
          requestedBy: user?.name || "Unknown User",
        });
      } catch (err) {
        // Handle validation errors from backend
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("Refunds are not enabled")) {
          toast({
            title: "Refunds Disabled",
            description:
              "Refunds are currently disabled in system settings. Please contact your administrator.",
            variant: "destructive",
          });
        } else {
          toast({
            title: "Submission Error",
            description: msg,
            variant: "destructive",
          });
        }
        setIsLoading(false);
        return;
      }

      toast({
        title: "Refund Request Created",
        description: `Refund request #${refundRequest.id} has been created successfully`,
      });

      // Show explicit routing message
      if (refundRequest.status === "approved") {
        toast({
          title: "Refund Auto-Approved",
          description:
            "This refund was auto-approved and can be processed immediately.",
          variant: "default",
        });
      } else if (formData.authorizedBy === "Admin") {
        toast({
          title: "Sent for Admin Approval",
          description:
            "Your refund request has been sent to the admin for approval.",
          variant: "default",
        });
      } else if (formData.authorizedBy === "Restaurant Manager") {
        toast({
          title: "Sent for Manager Approval",
          description:
            "Your refund request has been sent to the manager for approval.",
          variant: "default",
        });
      }

      // Close dialog and reset form
      onOpenChange(false);
      setFormData({
        orderId: "",
        orderNumber: "",
        customerName: "",
        customerRefused: false,
        originalAmount: 0,
        refundAmount: 0,
        paymentMethod: "",
        reason: "",
        authorizedBy: "",
        additionalNotes: "",
      });
      setErrors({});
    } catch (error) {
      toast({
        title: "Unknown Error",
        description:
          error instanceof Error
            ? error.message
            : "Failed to create refund request",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Check if user can approve this refund
  const canApprove = () => {
    if (user?.role === "admin") return true;
    if (user?.role === "manager") {
      return formData.refundAmount <= settings.system.refunds.maxManagerRefund;
    }
    return false;
  };

  // Get approval status
  const getApprovalStatus = () => {
    if (!canApprove()) {
      return {
        status: "requires-approval",
        message: "This refund requires admin approval",
        icon: <Clock className="h-4 w-4" />,
      };
    }

    if (formData.refundAmount <= settings.system.refunds.smallAmountThreshold) {
      return {
        status: "auto-approve",
        message: "This refund will be auto-approved",
        icon: <CheckCircle className="h-4 w-4" />,
      };
    }

    return {
      status: "can-approve",
      message: "You can approve this refund",
      icon: <CheckCircle className="h-4 w-4" />,
    };
  };

  const approvalStatus = getApprovalStatus();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-white/90 dark:bg-gray-800/90 backdrop-blur-md border border-orange-200 dark:border-orange-700 rounded-3xl overflow-y-auto max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-orange-800 dark:text-orange-200">
            <DollarSign className="h-5 w-5" />
            Initiate Refund Request
          </DialogTitle>
          <DialogDescription className="text-orange-600 dark:text-orange-400">
            You&apos;re about to process a refund. Please confirm the following
            details and provide a reason for the refund. This action will be
            logged and may require approval depending on the refund amount.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          {/* Approval Status Alert */}
          <Alert
            className={`${
              approvalStatus.status === "requires-approval"
                ? "border-orange-200 bg-orange-50 dark:border-orange-700 dark:bg-orange-900/20"
                : "border-green-200 bg-green-50 dark:border-green-700 dark:bg-green-900/20"
            }`}
          >
            <div className="flex items-center gap-2">
              {approvalStatus.icon}
              <AlertDescription className="text-sm">
                {approvalStatus.message}
              </AlertDescription>
            </div>
          </Alert>

          {/* Order Information */}
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label
                  htmlFor="orderId"
                  className="text-sm text-gray-700 dark:text-gray-300"
                >
                  Order ID
                </Label>
                <Input
                  id="orderId"
                  value={formData.orderId}
                  onChange={(e) => {
                    setFormData({ ...formData, orderId: e.target.value });
                    if (!orderData) setIsVerified(false);
                  }}
                  className="rounded-2xl border-orange-200 dark:border-orange-700 focus:border-orange-500 dark:focus:border-orange-400 bg-white/50 dark:bg-gray-800/50"
                  disabled={isVerified && !!orderData}
                />
                {errors.orderId && (
                  <p className="text-xs text-red-600 dark:text-red-400">
                    {errors.orderId}
                  </p>
                )}
              </div>
              <div className="grid gap-2">
                <Label
                  htmlFor="orderNumber"
                  className="text-sm text-gray-700 dark:text-gray-300"
                >
                  Order Number
                </Label>
                <Input
                  id="orderNumber"
                  value={formData.orderNumber}
                  onChange={(e) => {
                    setFormData({ ...formData, orderNumber: e.target.value });
                    if (!orderData) setIsVerified(false);
                  }}
                  className="rounded-2xl border-orange-200 dark:border-orange-700 focus:border-orange-500 dark:focus:border-orange-400 bg-white/50 dark:bg-gray-800/50"
                  disabled={isVerified && !!orderData}
                />
              </div>
            </div>

            {!isVerified && (
              <Button
                type="button"
                variant="outline"
                onClick={handleVerifyOrder}
                disabled={
                  isVerifying || (!formData.orderId && !formData.orderNumber)
                }
                className="w-full border-orange-200 hover:bg-orange-50 hover:text-orange-900 dark:border-orange-700 dark:hover:bg-orange-900/50 dark:hover:text-orange-100"
              >
                {isVerifying ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Verifying Order...
                  </>
                ) : (
                  "Verify Order Details"
                )}
              </Button>
            )}
          </div>

          {/* Customer Information */}
          <div className="grid gap-2">
            <Label
              htmlFor="customerName"
              className="text-sm text-gray-700 dark:text-gray-300"
            >
              Customer Name
            </Label>
            <div className="flex items-center gap-2 mb-1">
              <Checkbox
                id="customerRefused"
                checked={formData.customerRefused}
                onCheckedChange={(checked) => {
                  const isChecked = Boolean(checked);
                  setFormData({
                    ...formData,
                    customerRefused: isChecked,
                    customerName: isChecked ? "" : formData.customerName,
                  });
                  if (isChecked) {
                    setErrors((prev) => {
                      const newErrors = { ...prev };
                      delete newErrors.customerName;
                      return newErrors;
                    });
                  }
                }}
              />
              <Label
                htmlFor="customerRefused"
                className="text-xs text-gray-600 dark:text-gray-400"
              >
                Customer refused to provide name
              </Label>
            </div>
            <Input
              id="customerName"
              value={formData.customerName}
              onChange={(e) =>
                setFormData({ ...formData, customerName: e.target.value })
              }
              className="rounded-2xl border-orange-200 dark:border-orange-700 focus:border-orange-500 dark:focus:border-orange-400 bg-white/50 dark:bg-gray-800/50"
              disabled={formData.customerRefused}
              placeholder={
                formData.customerRefused ? "Refused" : "Enter customer name"
              }
            />
            {errors.customerName && (
              <p className="text-xs text-red-600 dark:text-red-400">
                {errors.customerName}
              </p>
            )}
            {formData.customerRefused && (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Name is optional when customer refuses; this will be noted.
              </p>
            )}
          </div>

          {/* Amount Information */}
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label
                htmlFor="originalAmount"
                className="text-sm text-gray-700 dark:text-gray-300"
              >
                Original Amount
              </Label>
              <Input
                id="originalAmount"
                type="number"
                value={formData.originalAmount}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    originalAmount: Number(e.target.value),
                  })
                }
                className="rounded-2xl border-orange-200 dark:border-orange-700 focus:border-orange-500 dark:focus:border-orange-400 bg-white/50 dark:bg-gray-800/50"
                disabled
              />
            </div>
            <div className="grid gap-2">
              <Label
                htmlFor="refundAmount"
                className="text-sm text-gray-700 dark:text-gray-300"
              >
                Refund Amount
              </Label>
              <Input
                id="refundAmount"
                type="number"
                step="0.01"
                value={formData.refundAmount}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    refundAmount: Number(e.target.value),
                  })
                }
                className="rounded-2xl border-orange-200 dark:border-orange-700 focus:border-orange-500 dark:focus:border-orange-400 bg-white/50 dark:bg-gray-800/50"
                disabled={!isVerified}
              />
              {errors.refundAmount && (
                <p className="text-xs text-red-600 dark:text-red-400">
                  {errors.refundAmount}
                </p>
              )}
            </div>
          </div>

          {/* Payment Method */}
          <div className="grid gap-2">
            <Label
              htmlFor="paymentMethod"
              className="text-sm text-gray-700 dark:text-gray-300"
            >
              Payment Method
            </Label>
            <Select
              value={formData.paymentMethod}
              onValueChange={(value) =>
                setFormData({ ...formData, paymentMethod: value })
              }
            >
              <SelectTrigger className="rounded-2xl border-orange-200 dark:border-orange-700 focus:border-orange-500 dark:focus:border-orange-400 bg-white/50 dark:bg-gray-800/50">
                <SelectValue placeholder="Select payment method" />
              </SelectTrigger>
              <SelectContent className="rounded-2xl border-orange-200 dark:border-orange-700">
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="card">Card</SelectItem>
                <SelectItem value="mobile">Mobile Money</SelectItem>
              </SelectContent>
            </Select>
            {errors.paymentMethod && (
              <p className="text-xs text-red-600 dark:text-red-400">
                {errors.paymentMethod}
              </p>
            )}
          </div>

          {/* Reason for Refund */}
          <div className="grid gap-2">
            <Label
              htmlFor="reason"
              className="text-sm text-gray-700 dark:text-gray-300"
            >
              Reason for Refund *
            </Label>
            <Textarea
              id="reason"
              value={formData.reason}
              onChange={(e) =>
                setFormData({ ...formData, reason: e.target.value })
              }
              placeholder="Please provide a detailed reason for the refund..."
              className="rounded-2xl border-orange-200 dark:border-orange-700 focus:border-orange-500 dark:focus:border-orange-400 bg-white/50 dark:bg-gray-800/50 min-h-[80px]"
            />
            {errors.reason && (
              <p className="text-xs text-red-600 dark:text-red-400">
                {errors.reason}
              </p>
            )}
          </div>

          {/* Authorized By */}
          <div className="grid gap-2">
            <Label
              htmlFor="authorizedBy"
              className="text-sm text-gray-700 dark:text-gray-300"
            >
              Authorized By
            </Label>
            <Select
              value={formData.authorizedBy}
              onValueChange={(value) =>
                setFormData({ ...formData, authorizedBy: value })
              }
            >
              <SelectTrigger className="rounded-2xl border-orange-200 dark:border-orange-700 focus:border-orange-500 dark:focus:border-orange-400 bg-white/50 dark:bg-gray-800/50">
                <SelectValue placeholder="Select authorized person" />
              </SelectTrigger>
              <SelectContent className="rounded-2xl border-orange-200 dark:border-orange-700">
                <SelectItem value="Admin">Admin</SelectItem>
                <SelectItem value="Restaurant Manager">
                  Restaurant Manager
                </SelectItem>
              </SelectContent>
            </Select>
            {errors.authorizedBy && (
              <p className="text-xs text-red-600 dark:text-red-400">
                {errors.authorizedBy}
              </p>
            )}
          </div>

          {/* Additional Notes */}
          <div className="grid gap-2">
            <Label
              htmlFor="additionalNotes"
              className="text-sm text-gray-700 dark:text-gray-300"
            >
              Additional Notes (Optional)
            </Label>
            <Textarea
              id="additionalNotes"
              value={formData.additionalNotes}
              onChange={(e) =>
                setFormData({ ...formData, additionalNotes: e.target.value })
              }
              placeholder="Any additional information..."
              className="rounded-2xl border-orange-200 dark:border-orange-700 focus:border-orange-500 dark:focus:border-orange-400 bg-white/50 dark:bg-gray-800/50 min-h-[60px]"
            />
          </div>
        </div>

        <DialogFooter className="flex flex-col-reverse sm:flex-row gap-2 sm:gap-4 mt-4">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="rounded-2xl border-orange-200 dark:border-orange-700 hover:bg-orange-50 dark:hover:bg-orange-900/20 text-orange-700 dark:text-orange-300 bg-transparent w-full sm:w-auto"
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isLoading}
            className="rounded-2xl bg-gradient-to-r from-orange-500 via-amber-500 to-yellow-500 hover:from-orange-600 hover:via-amber-600 hover:to-yellow-600 text-white shadow-lg w-full sm:w-auto"
          >
            {isLoading ? "Processing..." : "Confirm Refund"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
