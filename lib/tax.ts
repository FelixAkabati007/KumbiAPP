import { query } from "@/lib/db";
import type { TaxConfiguration } from "@/lib/settings";

export const defaultTaxConfiguration: TaxConfiguration = {
  enabled: true,
  appliesToPos: true,
  appliesToRooms: true,
  appliesToEvents: true,
  tin: "C0029384756",
  graEVatRate: 0,
  vatRate: 15,
  nhilRate: 2.5,
  getFundRate: 2.5,
  tourismLevyRate: 1.0,
  covidLevyRate: 0,
  graEVatEnabled: true,
  vatEnabled: true,
  nhilEnabled: true,
  getFundEnabled: true,
  tourismLevyEnabled: true,
  covidLevyEnabled: false,
  pricingMode: "exclusive",
  levyDisplayMode: "amount",
};

export interface TaxBreakdown {
  nhil: number;
  getFund: number;
  tourism: number;
  covidLevy: number;
  vat: number;
  vatTaxableBase: number;
  taxableBase: number;
  totalTax: number;
  // Aliases for convenience & backward compatibility
  standardVat: number;
  getfund: number;
  graEVat?: number;
}

export interface TaxCalculationResult {
  subtotal: number;
  tax: number;
  total: number;
  effectiveRate: number;
  breakdown: TaxBreakdown;
  tin?: string;
  isGraEVatEnabled: boolean;
}

export async function getTaxConfiguration(): Promise<TaxConfiguration> {
  try {
    const result = await query<{ data: { system?: { taxConfiguration?: Partial<TaxConfiguration> } } }>(
      "SELECT data FROM settings WHERE id = 1 LIMIT 1"
    );
    const configured = result.rows[0]?.data?.system?.taxConfiguration;
    const merged: TaxConfiguration = { ...defaultTaxConfiguration, ...(configured || {}) };

    // Migrate previous built-in defaults when they were never customized
    if (
      configured &&
      configured.vatRate === 12.5 &&
      configured.nhilRate === 2.5 &&
      configured.getFundRate === 2.5 &&
      configured.covidLevyRate === 1
    ) {
      return { ...merged, vatRate: 15, covidLevyRate: 0 };
    }
    return merged;
  } catch {
    return defaultTaxConfiguration;
  }
}

/**
 * Calculates Ghana Revenue Authority (GRA) compliant statutory taxes and levies.
 *
 * Statutory Formulation (Act 870 §3, Act 857, Act 581, and Act 817):
 * 1. NHIL: 2.5% on Taxable Supply Value
 * 2. GETFund: 2.5% on Taxable Supply Value
 * 3. Tourism Levy: 1.0% on Taxable Supply Value
 * 4. COVID-19 Levy: 1.0% (or 0% if disabled/abolished) on Taxable Supply Value
 * 5. VAT: 15.0% on Compounded Base (Taxable Supply Value + NHIL + GETFund + Tourism + COVID)
 */
export function calculateTaxes(
  subtotal: number,
  config: Partial<TaxConfiguration> = defaultTaxConfiguration,
  module: "pos" | "rooms" | "events" = "pos"
): TaxCalculationResult {
  const mergedConfig: TaxConfiguration = { ...defaultTaxConfiguration, ...config };
  const applies =
    mergedConfig.enabled &&
    (module === "pos"
      ? mergedConfig.appliesToPos
      : module === "rooms"
      ? mergedConfig.appliesToRooms
      : mergedConfig.appliesToEvents);

  const emptyBreakdown: TaxBreakdown = {
    nhil: 0,
    getFund: 0,
    getfund: 0,
    tourism: 0,
    covidLevy: 0,
    vat: 0,
    standardVat: 0,
    vatTaxableBase: roundMoney(subtotal),
    taxableBase: roundMoney(subtotal),
    totalTax: 0,
    graEVat: 0,
  };

  if (!applies || subtotal <= 0) {
    return {
      subtotal: roundMoney(subtotal),
      tax: 0,
      total: roundMoney(subtotal),
      effectiveRate: 0,
      breakdown: emptyBreakdown,
      tin: mergedConfig.tin,
      isGraEVatEnabled: Boolean(mergedConfig.graEVatEnabled),
    };
  }

  const isNhilEnabled = mergedConfig.nhilEnabled !== false;
  const isGetFundEnabled = mergedConfig.getFundEnabled !== false;
  const isTourismEnabled = mergedConfig.tourismLevyEnabled !== false;
  const isCovidEnabled = Boolean(mergedConfig.covidLevyEnabled);
  const isVatEnabled = mergedConfig.vatEnabled !== false;

  const nhilRate = isNhilEnabled ? Number(mergedConfig.nhilRate ?? 2.5) : 0;
  const getFundRate = isGetFundEnabled ? Number(mergedConfig.getFundRate ?? 2.5) : 0;
  const tourismRate = isTourismEnabled ? Number(mergedConfig.tourismLevyRate ?? 1.0) : 0;
  const covidRate = isCovidEnabled ? Number(mergedConfig.covidLevyRate ?? 0) : 0;
  const vatRate = isVatEnabled ? Number(mergedConfig.vatRate ?? 15.0) : 0;

  let netBase = subtotal;

  if (mergedConfig.pricingMode === "inclusive") {
    // Under inclusive pricing, extract net base: Gross / ((1 + sum(levies)) * (1 + vatRate))
    const totalLevyRate = (nhilRate + getFundRate + tourismRate + covidRate) / 100;
    const compoundMultiplier = (1 + totalLevyRate) * (1 + vatRate / 100);
    netBase = compoundMultiplier > 0 ? roundMoney(subtotal / compoundMultiplier) : subtotal;
  }

  const nhil = roundMoney(netBase * (nhilRate / 100));
  const getFund = roundMoney(netBase * (getFundRate / 100));
  const tourism = roundMoney(netBase * (tourismRate / 100));
  const covidLevy = roundMoney(netBase * (covidRate / 100));

  const statutoryLeviesSum = nhil + getFund + tourism + covidLevy;
  const vatTaxableBase = roundMoney(netBase + statutoryLeviesSum);
  const vat = roundMoney(vatTaxableBase * (vatRate / 100));

  const totalTax = roundMoney(statutoryLeviesSum + vat);
  const grandTotal =
    mergedConfig.pricingMode === "inclusive"
      ? roundMoney(subtotal)
      : roundMoney(netBase + totalTax);

  const effectiveRate = netBase > 0 ? roundMoney((totalTax / netBase) * 100) : 0;

  return {
    subtotal: roundMoney(netBase),
    tax: totalTax,
    total: grandTotal,
    effectiveRate,
    breakdown: {
      nhil,
      getFund,
      getfund: getFund,
      tourism,
      covidLevy,
      vat,
      standardVat: vat,
      vatTaxableBase,
      taxableBase: roundMoney(netBase),
      totalTax,
      graEVat: 0,
    },
    tin: mergedConfig.tin || "C0029384756",
    isGraEVatEnabled: Boolean(mergedConfig.graEVatEnabled),
  };
}

export function roundMoney(value: number): number {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}
