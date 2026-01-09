import React, { useCallback } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  act,
  cleanup,
} from "@testing-library/react";
import {
  PaymentCompletionConfirmation,
  usePaymentCompletionConfirmation,
} from "@/components/payment/payment-completion-confirmation";

function Harness() {
  const confirmation = usePaymentCompletionConfirmation({
    visibleMs: 2000,
    fadeMs: 300,
  });

  const onClick = useCallback(() => {
    confirmation.trigger();
  }, [confirmation]);

  return (
    <div>
      <button type="button" onClick={onClick}>
        Complete Payment
      </button>
      <PaymentCompletionConfirmation
        mounted={confirmation.mounted}
        visible={confirmation.visible}
      />
    </div>
  );
}

describe("Payment completion confirmation", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("shows the confirmation on click and hides after 2 seconds", async () => {
    render(<Harness />);

    expect(screen.queryByText("Successful")).toBeNull();

    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: /complete payment/i }),
      );
    });

    await act(async () => {
      vi.advanceTimersByTime(0);
    });

    const banner = screen.getByText("Successful");
    expect(banner).toBeInTheDocument();
    expect(banner).toHaveAttribute("role", "status");
    expect(banner).toHaveAttribute("aria-live", "polite");
    expect(banner).toHaveAttribute("aria-atomic", "true");

    await act(async () => {
      vi.advanceTimersByTime(1699);
    });
    expect(banner).toHaveAttribute("data-state", "visible");

    await act(async () => {
      vi.advanceTimersByTime(1);
    });
    expect(banner).toHaveAttribute("data-state", "hidden");

    await act(async () => {
      vi.advanceTimersByTime(299);
    });
    expect(screen.queryByText("Successful")).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.queryByText("Successful")).toBeNull();
  });
});
