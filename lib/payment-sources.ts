export type PaymentSource = "hotel" | "restaurant" | "event" | "shared_event" | "shared"

export const PAYMENT_SOURCE_LABELS: Record<PaymentSource, string> = {
  hotel: "Hotel Activity",
  restaurant: "Restaurant Sales",
  event: "Event",
  shared_event: "Shared Event",
  shared: "Shared Operations",
}

export function normalizePaymentSource(input: {
  source?: string | null
  entityType?: string | null
  metadata?: Record<string, unknown> | null
}): PaymentSource {
  const source = String(input.source ?? "").trim().toLowerCase().replace(/[-\s]+/g, "_")
  const entityType = String(input.entityType ?? "").trim().toLowerCase().replace(/[-\s]+/g, "_")
  const metadata = input.metadata ?? {}
  const shared = metadata.sharedEvent === true || metadata.shared_event === true || metadata.isSharedEvent === true || ["shared_event", "shared_events", "event_shared"].includes(source) || ["shared_event", "shared_events", "event_shared"].includes(entityType)

  if (shared) return "shared_event"
  if (["event", "events", "event_organization", "event_booking"].includes(source) || ["event", "events", "event_organization"].includes(entityType)) return "event"
  if (["restaurant", "pos", "food_beverage", "food_and_beverage"].includes(source)) return "restaurant"
  if (["hotel", "hotel_activity", "room", "rooms"].includes(source)) return "hotel"
  return "shared"
}

export function paymentSourceLabel(source: PaymentSource) {
  return PAYMENT_SOURCE_LABELS[source]
}
