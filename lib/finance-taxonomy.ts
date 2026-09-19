export const FINANCE_SOURCES = ["hotel", "restaurant", "event", "refund", "shared"] as const;

export type FinanceSource = (typeof FINANCE_SOURCES)[number];

export const FINANCE_SOURCE_LABELS: Record<FinanceSource, string> = {
  hotel: "Hotel",
  restaurant: "Restaurant",
  event: "Event Organization",
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
  if (["unknown", ""].includes(normalized)) return "shared";
  return isFinanceSource(normalized) ? normalized : "shared";
}
