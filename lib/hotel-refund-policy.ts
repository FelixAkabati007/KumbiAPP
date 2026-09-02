export type HotelRefundDecision = {
  eligible: boolean;
  reason?: string;
  deadline: Date;
};

/**
 * Hotel policy: Front Desk may request a paid booking refund only before
 * check-in and before the configured cancellation deadline. The default
 * window is 30 minutes before the booked start date.
 */
export function evaluateHotelRefund({
  status,
  paidAmount,
  checkInDate,
  now = new Date(),
  cancellationWindowMinutes = 30,
}: {
  status: string;
  paidAmount: number;
  checkInDate: string | Date;
  now?: Date;
  cancellationWindowMinutes?: number;
}): HotelRefundDecision {
  const deadline = new Date(checkInDate);
  deadline.setMinutes(deadline.getMinutes() - cancellationWindowMinutes);

  if (paidAmount <= 0) {
    return { eligible: false, reason: "This booking has no recorded payment.", deadline };
  }
  if (["checked_in", "checked_out"].includes(status)) {
    return { eligible: false, reason: "Refunds cannot be requested after check-in or checkout.", deadline };
  }
  if (!["confirmed", "reserved", "booked"].includes(status)) {
    return { eligible: false, reason: `Refunds are unavailable for a ${status.replaceAll("_", " ")} booking.`, deadline };
  }
  if (now >= deadline) {
    return { eligible: false, reason: "This paid booking is non-refundable after the cancellation deadline.", deadline };
  }

  return { eligible: true, deadline };
}

export function formatHotelRefundRule(cancellationWindowMinutes = 30) {
  return `Paid hotel bookings are refundable only until ${cancellationWindowMinutes} minutes before the booked start time. After that, refunds require Finance or Management exception approval.`;
}
