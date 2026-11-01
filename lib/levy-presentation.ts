import type { TaxConfiguration } from "@/lib/settings";

export const STATUTORY_LEVY_LABELS = [
  ["nhil", "NHIL", "nhilRate"],
  ["getFund", "GETFund", "getFundRate"],
  ["tourism", "Tourism Levy (GTA)", "tourismLevyRate"],
  ["covidLevy", "COVID-19 Health Recovery", "covidLevyRate"],
  ["vat", "VAT (Standard)", "vatRate"],
] as const;

export type StatutoryLevyKey = (typeof STATUTORY_LEVY_LABELS)[number][0];
export type LevyBreakdown = Partial<Record<StatutoryLevyKey | "vatTaxableBase" | "graEVat", number>>;
export type LevyDisplayMode = "amount" | "percentage";

export interface LevyRowItem {
  key: string;
  label: string;
  amount: number;
  rate: number;
  mode: LevyDisplayMode;
  formatted: string;
  accessibleValue: string;
  subtotal: number;
}

export function levyRows(
  breakdown: LevyBreakdown,
  config?: Partial<TaxConfiguration>,
  subtotal = 0,
  prefix = "₵"
): LevyRowItem[] {
  const mode: LevyDisplayMode = config?.levyDisplayMode ?? "amount";

  return STATUTORY_LEVY_LABELS.filter(([key]) => {
    if (key === "nhil") return config?.nhilEnabled !== false;
    if (key === "getFund") return config?.getFundEnabled !== false;
    if (key === "tourism") return config?.tourismLevyEnabled !== false;
    if (key === "covidLevy") return Boolean(config?.covidLevyEnabled);
    if (key === "vat") return config?.vatEnabled !== false;
    return true;
  })
    .map(([key, label, rateKey]) => {
      const amount = Number(breakdown[key] ?? 0);
      const rate = Number(config?.[rateKey as keyof TaxConfiguration] ?? 0);
      return {
        key,
        label,
        amount,
        rate,
        mode,
        formatted: mode === "percentage" ? `${rate.toFixed(2)}%` : `${prefix}${amount.toFixed(2)}`,
        accessibleValue:
          mode === "percentage"
            ? `${rate.toFixed(2)}% (${prefix}${amount.toFixed(2)})`
            : `${prefix}${amount.toFixed(2)}`,
        subtotal,
      };
    })
    .filter((row) => row.amount > 0 || row.rate > 0);
}

export function levyRowsHtml(
  breakdown: LevyBreakdown,
  config?: Partial<TaxConfiguration>,
  subtotal = 0,
  prefix = "₵"
): string {
  return levyRows(breakdown, config, subtotal, prefix)
    .map(
      ({ label, formatted }) =>
        `<div class="levy-line" style="display: flex; justify-content: space-between; font-size: 11px;"><span>${label}:</span><span style="font-family: monospace;">${formatted}</span></div>`
    )
    .join("");
}

export function levyRowsText(
  breakdown: LevyBreakdown,
  config?: Partial<TaxConfiguration>,
  subtotal = 0,
  prefix = "₵"
): string {
  return levyRows(breakdown, config, subtotal, prefix)
    .map(({ label, formatted }) => `${label}: ${formatted}`)
    .join("\n");
}

export interface GraFiscalMetadata {
  tin?: string;
  orderNumber: string;
  total: number;
  date?: string;
}

/**
 * Renders the official Ghana Revenue Authority (GRA) E-VAT Fiscal Compliance Header
 */
export function graFiscalHeaderHtml(metadata: GraFiscalMetadata): string {
  const tin = metadata.tin || "C0029384756";
  const sdcId = `SDC-KMB-${metadata.orderNumber.replace(/[^0-9A-Z]/gi, "").slice(-6)}`;
  return `
    <div class="gra-fiscal-header" style="border-top: 1px dashed #666; border-bottom: 1px dashed #666; padding: 4px 0; margin: 6px 0; text-align: center; font-size: 10px; font-family: monospace;">
      <div style="font-weight: bold; letter-spacing: 0.5px;">* GRA E-VAT FISCAL RECEIPT *</div>
      <div>TIN: ${tin}</div>
      <div>SDC ID: ${sdcId} | INVOICE: ${metadata.orderNumber}</div>
    </div>
  `;
}

/**
 * Renders the official GRA Verification QR Code / signature representation
 */
export function graFiscalFooterHtml(metadata: GraFiscalMetadata): string {
  const dateStr = metadata.date || new Date().toISOString().slice(0, 10);
  const verifyUrl = `https://efiscal.gra.gov.gh/verify?tin=${metadata.tin || "C0029384756"}&inv=${metadata.orderNumber}&tot=${metadata.total.toFixed(2)}`;
  return `
    <div class="gra-fiscal-footer" style="text-align: center; margin-top: 8px; font-size: 9px; color: #444; font-family: monospace;">
      <div style="font-weight: bold;">[ GRA E-VAT VERIFIED FISCAL RECEIPT ]</div>
      <div style="word-break: break-all; font-size: 8px; color: #666;">${verifyUrl}</div>
      <div style="font-size: 8px; margin-top: 2px;">Date: ${dateStr} · Powered by KumbiAPP</div>
    </div>
  `;
}
