import { query } from "@/lib/db";
import type { TaxConfiguration } from "@/lib/settings";

export const defaultTaxConfiguration: TaxConfiguration = {
  enabled: true,
  appliesToPos: true,
  appliesToRooms: true,
  appliesToEvents: true,
  // Ghana VAT reforms effective January 1, 2026: VAT 15%, NHIL 2.5%, GETFund 2.5%; COVID-19 levy abolished.
  // E-VAT is a GRA invoice format, not a separate percentage tax.
  graEVatRate: 0,
  vatRate: 15,
  nhilRate: 2.5,
  getFundRate: 2.5,
  covidLevyRate: 0,
};

export async function getTaxConfiguration(): Promise<TaxConfiguration> {
  const result = await query("SELECT data FROM settings WHERE id = 1");
  const configured = result.rows[0]?.data?.system?.taxConfiguration;
  const merged = { ...defaultTaxConfiguration, ...(configured || {}) };
  // Migrate the previous built-in 2025 defaults to the current Ghana regime when they were never customized.
  if (configured && configured.vatRate === 12.5 && configured.nhilRate === 2.5 && configured.getFundRate === 2.5 && configured.covidLevyRate === 1) {
    return { ...merged, vatRate: 15, covidLevyRate: 0 };
  }
  return merged;
}

export function calculateTaxes(subtotal: number, config: TaxConfiguration, module: "pos" | "rooms" | "events") {
  const applies = config.enabled && (module === "pos" ? config.appliesToPos : module === "rooms" ? config.appliesToRooms : config.appliesToEvents);
  if (!applies || subtotal <= 0) return { subtotal, tax: 0, total: subtotal, breakdown: {} };
  const breakdown = {
    // GRA E-VAT is an invoicing/compliance channel, not an additional tax rate.
    graEVat: 0,
    vat: config.vatEnabled === false ? 0 : roundMoney(subtotal * (Number(config.vatRate) / 100)),
    nhil: config.nhilEnabled === false ? 0 : roundMoney(subtotal * (Number(config.nhilRate) / 100)),
    getFund: config.getFundEnabled === false ? 0 : roundMoney(subtotal * (Number(config.getFundRate) / 100)),
    covidLevy: config.covidLevyEnabled === false ? 0 : roundMoney(subtotal * (Number(config.covidLevyRate) / 100)),
  };
  const tax = roundMoney(Object.values(breakdown).reduce((sum, amount) => sum + amount, 0));
  return { subtotal: roundMoney(subtotal), tax, total: roundMoney(subtotal + tax), breakdown };
}

export function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
