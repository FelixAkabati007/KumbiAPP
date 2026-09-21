export const STATUTORY_LEVY_LABELS = [
  ["graEVat", "GRA E-VAT"],
  ["vat", "VAT"],
  ["nhil", "NHIL"],
  ["getFund", "GETFund"],
  ["covidLevy", "COVID-19 levy"],
] as const;

export type LevyBreakdown = Partial<Record<(typeof STATUTORY_LEVY_LABELS)[number][0], number>>;

export function levyRows(breakdown: LevyBreakdown, prefix = "₵") {
  return STATUTORY_LEVY_LABELS.map(([key, label]) => ({
    key,
    label,
    amount: Number(breakdown[key] ?? 0),
    formatted: `${prefix}${Number(breakdown[key] ?? 0).toFixed(2)}`,
  }));
}

export function levyRowsHtml(breakdown: LevyBreakdown, prefix = "₵") {
  return levyRows(breakdown)
    .map(({ label, amount }) => `<div class="levy-line"><span>${label}:</span><span>${prefix}${amount.toFixed(2)}</span></div>`)
    .join("");
}

export function levyRowsText(breakdown: LevyBreakdown) {
  return levyRows(breakdown).map(({ label, formatted }) => `${label}: ${formatted}`).join("\\n");
}
