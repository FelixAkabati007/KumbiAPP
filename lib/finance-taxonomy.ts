export const FINANCE_SOURCES = ["hotel", "restaurant", "event", "gym", "refund", "shared"] as const;

export type FinanceSource = (typeof FINANCE_SOURCES)[number];

export const FINANCE_SOURCE_LABELS: Record<FinanceSource, string> = {
  hotel: "Hotel",
  restaurant: "Restaurant",
  event: "Event Organization",
  gym: "Gym & Fitness",
  refund: "Refund",
  shared: "Shared / Corporate",
};

export function isFinanceSource(value: string): value is FinanceSource {
  return FINANCE_SOURCES.includes(value as FinanceSource);
}

export function normalizeFinanceSource(value: unknown): FinanceSource {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (["events", "event_organization"].includes(normalized)) return "event";
  if (["pos", "food_beverage"].includes(normalized)) return "restaurant";
  if (["gym", "fitness", "wellness", "gym_booking", "gym_membership", "gym_payment"].includes(normalized)) return "gym";
  if (["unknown", ""].includes(normalized)) return "shared";
  return isFinanceSource(normalized) ? normalized : "shared";
}
