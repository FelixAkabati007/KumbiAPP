import { describe, expect, it } from "vitest";
import { normalizePaymentSource } from "@/lib/payment-sources";

describe("normalizePaymentSource", () => {
  it("classifies hotel checkouts, folios, and rooms as hotel", () => {
    expect(normalizePaymentSource({ source: "hotel_checkout" })).toBe("hotel");
    expect(normalizePaymentSource({ source: "hotel-checkout" })).toBe("hotel");
    expect(normalizePaymentSource({ source: "hotel-pre-checkin" })).toBe("hotel");
    expect(normalizePaymentSource({ source: "hotel_folio" })).toBe("hotel");
    expect(normalizePaymentSource({ source: "guest-folio" })).toBe("hotel");
    expect(normalizePaymentSource({ source: "HOTEL_PAYMENT" })).toBe("hotel");
    expect(normalizePaymentSource({ entityType: "reservation" })).toBe("hotel");
    expect(normalizePaymentSource({ metadata: { department: "hotel" } })).toBe("hotel");
    expect(normalizePaymentSource({ metadata: { businessUnit: "room" } })).toBe("hotel");
  });

  it("classifies POS orders, restaurant orders, and kitchen orders as restaurant", () => {
    expect(normalizePaymentSource({ source: "pos-order-completion" })).toBe("restaurant");
    expect(normalizePaymentSource({ source: "pos_order_completion" })).toBe("restaurant");
    expect(normalizePaymentSource({ source: "restaurant-order" })).toBe("restaurant");
    expect(normalizePaymentSource({ source: "hotel-folio-restaurant" })).toBe("restaurant");
    expect(normalizePaymentSource({ source: "pos" })).toBe("restaurant");
    expect(normalizePaymentSource({ entityType: "restaurant_order" })).toBe("restaurant");
    expect(normalizePaymentSource({ metadata: { department: "restaurant" } })).toBe("restaurant");
    expect(normalizePaymentSource({ metadata: { department: "pos" } })).toBe("restaurant");
  });

  it("classifies event payments and event bookings as event", () => {
    expect(normalizePaymentSource({ source: "event_payment" })).toBe("event");
    expect(normalizePaymentSource({ source: "event-payment:evt-1:idemp-1" })).toBe("event");
    expect(normalizePaymentSource({ source: "event_booking" })).toBe("event");
    expect(normalizePaymentSource({ entityType: "event" })).toBe("event");
    expect(normalizePaymentSource({ metadata: { department: "event_organization" } })).toBe("event");
  });

  it("classifies VIP authorizations and shared events as shared_event", () => {
    expect(normalizePaymentSource({ source: "vip-authorization-001" })).toBe("shared_event");
    expect(normalizePaymentSource({ source: "shared_event" })).toBe("shared_event");
    expect(normalizePaymentSource({ metadata: { sharedEvent: true } })).toBe("shared_event");
    expect(normalizePaymentSource({ metadata: { department: "Shared Event" } })).toBe("shared_event");
  });

  it("classifies F0/FO corporate records and unknown records as shared", () => {
    expect(normalizePaymentSource({ source: "f0-001" })).toBe("shared");
    expect(normalizePaymentSource({ source: "fo-001" })).toBe("shared");
    expect(normalizePaymentSource({ metadata: { businessUnit: "corporate" } })).toBe("shared");
    expect(normalizePaymentSource({ source: "unknown-misc" })).toBe("shared");
  });
});
