import type { TaxConfiguration } from "@/lib/settings";

export const STATUTORY_LEVY_LABELS = [
  ["graEVat", "GRA E-VAT", "graEVatRate"],
  ["vat", "VAT", "vatRate"],
  ["nhil", "NHIL", "nhilRate"],
  ["getFund", "GETFund", "getFundRate"],
  ["covidLevy", "COVID-19 levy", "covidLevyRate"],
] as const;

export type LevyBreakdown = Partial<Record<(typeof STATUTORY_LEVY_LABELS)[number][0], number>>;
export type LevyDisplayMode = "amount" | "percentage";

export function levyRows(
  breakdown: LevyBreakdown,
  config?: Partial<TaxConfiguration>,
  subtotal = 0,
  prefix = "₵",
) {
  const mode: LevyDisplayMode = config?.levyDisplayMode ?? "amount";
  return STATUTORY_LEVY_LABELS.map(([key, label, rateKey]) => {
    const amount = Number(breakdown[key] ?? 0);
    const rate = Number(config?.[rateKey] ?? 0);
    return {
      key,
      label,
      amount,
      rate,
      mode,
      formatted: mode === "percentage" ? `${rate.toFixed(2)}%` : `${prefix}${amount.toFixed(2)}`,
      accessibleValue: mode === "percentage" ? `${rate.toFixed(2)}% (${prefix}${amount.toFixed(2)})` : `${prefix}${amount.toFixed(2)}`,
      subtotal,
    };
  });
}

export function levyRowsHtml(
  breakdown: LevyBreakdown,
  config?: Partial<TaxConfiguration>,
  subtotal = 0,
  prefix = "₵",
) {
  return levyRows(breakdown, config, subtotal, prefix)
    .map(({ label, formatted }) => `<div class="levy-line"><span>${label}:</span><span>${formatted}</span></div>`)
    .join("");
}

export function levyRowsText(
  breakdown: LevyBreakdown,
  config?: Partial<TaxConfiguration>,
  subtotal = 0,
  prefix = "₵",
) {
  return levyRows(breakdown, config, subtotal, prefix)
    .map(({ label, formatted }) => `${label}: ${formatted}`)
    .join("\n");
}
