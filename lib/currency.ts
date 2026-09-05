import { getSettings } from "./settings"

export function formatCurrency(amount: number | string | null | undefined) {
  const value = Number(amount ?? 0)
  return new Intl.NumberFormat("en-GH", {
    style: "currency",
    currency: getSettings().system.currency,
    currencyDisplay: "code",
    minimumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0)
}
