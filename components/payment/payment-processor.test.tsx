import React from "react";
import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { PaymentProcessor } from "./payment-processor";
import { PaymentService } from "@/lib/services/payment-service";

// Mock dependencies
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({
    toast: vi.fn(),
  }),
}));

vi.mock("@/components/ui/spinner", () => ({
  Spinner: () => null,
  LoadingSpinner: () => null,
}));

vi.mock("@/lib/services/payment-service", () => ({
  PaymentService: vi.fn(),
}));

describe("PaymentProcessor", () => {
  const mockOrder = {
    id: "order-123",
    orderNumber: "ORD-2025-001",
    items: [
      {
        id: "item-1",
        name: "Test Item",
        quantity: 2,
        price: 10.0,
        subtotal: 20.0,
        status: "pending" as const,
      },
    ],
    subtotal: 20.0,
    tax: 2.0,
    total: 22.0,
    status: "pending" as const,
    timestamp: new Date().toISOString(),
  };

  const mockCustomer = {
    id: "cust-123",
    name: "John Doe",
  };

  const mockPaymentDetails = {
    amount: 22.0,
    method: "card" as const,
    currency: "USD",
    cardDetails: {
      last4: "4242",
      brand: "visa",
      expiryMonth: 12,
      expiryYear: 2025,
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Mock successful payment by default
    PaymentService.prototype.processPayment = vi.fn().mockResolvedValue({
      success: true,
      transactionId: "tx-123",
    });
  });

  afterEach(() => {
    cleanup();
  });

  test("renders payment details correctly", () => {
    render(
      <PaymentProcessor
        order={mockOrder}
        customer={mockCustomer}
        paymentDetails={mockPaymentDetails}
      />,
    );

    expect(
      screen.getByText(`Order #: ${mockOrder.orderNumber}`),
    ).toBeInTheDocument();
    expect(
      screen.getByText(`Total: $${mockOrder.total.toFixed(2)}`),
    ).toBeInTheDocument();
    expect(screen.getByText(/Complete Payment/i)).toBeEnabled();
  });

  test("processes payment successfully", async () => {
    const { getByRole } = render(
      <PaymentProcessor
        order={mockOrder}
        customer={mockCustomer}
        paymentDetails={mockPaymentDetails}
      />,
    );

    fireEvent.click(getByRole("button", { name: /complete payment/i }));

    await waitFor(() => {
      expect(PaymentService.prototype.processPayment).toHaveBeenCalledWith(
        mockOrder,
        mockPaymentDetails,
        mockCustomer,
      );
    });

    await waitFor(() => {
      expect(screen.queryByText(/processing payment/i)).toBeNull();
    });
  });

  test("handles payment failure gracefully", async () => {
    // Mock payment failure
    PaymentService.prototype.processPayment = vi.fn().mockResolvedValue({
      success: false,
      error: "Payment declined",
    });

    const { getByRole } = render(
      <PaymentProcessor
        order={mockOrder}
        customer={mockCustomer}
        paymentDetails={mockPaymentDetails}
      />,
    );

    fireEvent.click(getByRole("button", { name: /complete payment/i }));

    await waitFor(() => {
      expect(screen.queryByText(/processing payment/i)).toBeNull();
    });
  });

  test("shows loading state during processing", async () => {
    // Mock slow payment processing
    PaymentService.prototype.processPayment = vi
      .fn()
      .mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(() => resolve({ success: true }), 100),
          ),
      );

    const { getByRole } = render(
      <PaymentProcessor
        order={mockOrder}
        customer={mockCustomer}
        paymentDetails={mockPaymentDetails}
      />,
    );

    fireEvent.click(getByRole("button", { name: /complete payment/i }));

    expect(screen.getByText(/processing payment/i)).toBeInTheDocument();
  });
});
