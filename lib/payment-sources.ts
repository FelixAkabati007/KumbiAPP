export type PaymentSource = "hotel" | "restaurant" | "event" | "gym" | "shared_event" | "shared"

export const PAYMENT_SOURCE_LABELS: Record<PaymentSource, string> = {
  hotel: "Hotel Activity",
  restaurant: "Restaurant Sales",
  event: "Event",
  gym: "Gym & Fitness",
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
  const dept = String(metadata.department ?? "").trim().toLowerCase().replace(/[-\s]+/g, "_")
  const bUnit = String(metadata.businessUnit ?? "").trim().toLowerCase().replace(/[-\s]+/g, "_")
  const metaSource = String(metadata.source ?? "").trim().toLowerCase().replace(/[-\s]+/g, "_")

  // Check shared event indicators
  const shared =
    metadata.sharedEvent === true ||
    metadata.shared_event === true ||
    metadata.isSharedEvent === true ||
    ["shared_event", "shared_events", "event_shared"].includes(dept) ||
    ["shared_event", "shared_events", "event_shared"].includes(bUnit) ||
    ["shared_event", "shared_events", "event_shared"].includes(source) ||
    ["shared_event", "shared_events", "event_shared"].includes(entityType) ||
    source.startsWith("vip_authorization") ||
    metaSource.startsWith("vip_authorization")

  if (shared) return "shared_event"

  // Check corporate / shared operations indicators
  const corporateShared =
    source.startsWith("f0_") ||
    source.startsWith("fo_") ||
    metaSource.startsWith("f0_") ||
    metaSource.startsWith("fo_") ||
    dept.startsWith("f0_") ||
    dept.startsWith("fo_") ||
    bUnit === "corporate" ||
    bUnit === "shared_operations" ||
    dept === "corporate"

  if (corporateShared) return "shared"

  // Check hotel indicators
  const hotelMatches = [
    "hotel",
    "hotel_activity",
    "hotel_checkout",
    "hotel_check_in",
    "hotel_pre_checkin",
    "hotel_pre_check_in",
    "hotel_folio",
    "hotel_payment",
    "guest_folio",
    "room",
    "rooms",
    "accommodation",
  ]
  if (
    hotelMatches.includes(source) ||
    hotelMatches.includes(metaSource) ||
    hotelMatches.includes(dept) ||
    hotelMatches.includes(bUnit) ||
    ["reservation", "guest_folio", "hotel"].includes(entityType)
  ) {
    return "hotel"
  }

  // Check restaurant indicators
  const restaurantMatches = [
    "restaurant",
    "pos",
    "pos_order_completion",
    "restaurant_order",
    "hotel_folio_restaurant",
    "food_beverage",
    "food_and_beverage",
    "kitchen_orders",
    "kitchenorders",
  ]
  if (
    restaurantMatches.includes(source) ||
    restaurantMatches.includes(metaSource) ||
    restaurantMatches.includes(dept) ||
    restaurantMatches.includes(bUnit) ||
    ["restaurant_order", "pos_order", "restaurant", "pos"].includes(entityType)
  ) {
    return "restaurant"
  }

  // Check event indicators
  const eventMatches = [
    "event",
    "events",
    "event_payment",
    "event_booking",
    "event_organization",
  ]
  if (
    eventMatches.includes(source) ||
    eventMatches.includes(metaSource) ||
    eventMatches.includes(dept) ||
    eventMatches.includes(bUnit) ||
    source.startsWith("event_payment") ||
    metaSource.startsWith("event_payment") ||
    ["event", "event_booking", "event_payment"].includes(entityType)
  ) {
    return "event"
  }

  // Check gym & fitness indicators
  const gymMatches = [
    "gym",
    "fitness",
    "wellness",
    "gym_booking",
    "gym_membership",
    "gym_payment",
    "gym_refund",
    "gym_and_fitness",
  ]
  if (
    gymMatches.includes(source) ||
    gymMatches.includes(metaSource) ||
    gymMatches.includes(dept) ||
    gymMatches.includes(bUnit) ||
    source.startsWith("gym_") ||
    metaSource.startsWith("gym_") ||
    ["gym", "gym_booking", "gym_membership", "gym_payment"].includes(entityType)
  ) {
    return "gym"
  }

  return "shared"
}

export function paymentSourceLabel(source: PaymentSource) {
  return PAYMENT_SOURCE_LABELS[source]
}
