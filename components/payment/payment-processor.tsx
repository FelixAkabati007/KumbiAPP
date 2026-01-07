"use client";

import React from "react";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PaymentService } from "@/lib/services/payment-service";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/ui/spinner";
import type { Order, Customer, PaymentDetails } from "@/lib/types/payment";
// no extra settings type here; we'll call getSettings at runtime

interface PaymentProcessorProps {
  order: Order;
  customer: Customer;
  paymentDetails: PaymentDetails;
}

export function PaymentProcessor({
  order,
  customer,
  paymentDetails,
}: PaymentProcessorProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const router = useRouter();
  const { toast } = useToast();
  const paymentService = new PaymentService();

  const handlePayment = async () => {
    setIsProcessing(true);

    try {
      const result = await paymentService.processPayment(
        order,
        paymentDetails,
        customer
      );

      if (result.success) {
        // Prepare receipt data for printing
        const maybeOrder = order as unknown as Record<string, unknown>;
        const orderType =
          typeof maybeOrder.orderType === "string"
            ? maybeOrder.orderType
            : "unknown";

        const receiptData = {
          orderNumber: order.orderNumber,
          date: new Date().toLocaleDateString(),
          time: new Date().toLocaleTimeString(),
          items: order.items.map((item) => ({
            name: item.name,
            quantity: item.quantity,
            price: item.price,
            total: item.price * item.quantity,
          })),
          subtotal: order.subtotal,
          tax: order.tax,
          total: order.total,
          paymentMethod: paymentDetails.method,
          customerName: customer.name,
          paymentId: result.transactionId,
          timestamp: new Date().toISOString(),
          // required by ReceiptData in thermal-printer.ts
          orderType,
        };

        // Print receipt
        try {
          const { getSettings } = await import("@/lib/settings");
          const settings = await getSettings();
          const { printReceipt } = await import("@/lib/thermal-printer");

          if (settings.system?.thermalPrinter?.enabled) {
            await printReceipt(receiptData, settings.system.thermalPrinter);
          }
        } catch (printError) {
          console.error("Receipt printing failed:", printError);
        }

        toast({
          title: "Payment Successful",
          description: `Transaction ID: ${result.transactionId}`,
          duration: 5000,
        });

        // Redirect to success page/receipt
        router.push(`/receipt/${order.orderNumber}`);
      } else {
        throw new Error(result.error || "Payment failed");
      }
    } catch (error) {
      console.error("Payment error:", error);
      toast({
        title: "Payment Failed",
        description:
          error instanceof Error
            ? error.message
            : "An error occurred during payment",
        variant: "destructive",
        duration: 7000,
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border p-4">
        <h3 className="text-lg font-medium mb-2">Order Summary</h3>
        <div className="space-y-2">
          <p>Order #: {order.orderNumber}</p>
          <p>Items: {order.items.length}</p>
          <p>Total: ${order.total.toFixed(2)}</p>
          <p>Payment Method: {paymentDetails.method}</p>
          {paymentDetails.method !== "cash" && (
            <p className="text-sm text-red-600">
              Card/mobile payments are currently unsupported
            </p>
          )}
        </div>
      </div>

      <Button
        onClick={handlePayment}
        disabled={isProcessing}
        className="w-full"
      >
        {isProcessing ? (
          <>
            <LoadingSpinner className="mr-2" />
            Processing Payment...
          </>
        ) : (
          "Complete Payment"
        )}
      </Button>

      {isProcessing && (
        <div className="text-sm text-muted-foreground text-center">
          Please do not close this window while the transaction is processing
        </div>
      )}
    </div>
  );
}
