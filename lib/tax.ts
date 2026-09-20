import { query } from "@/lib/db";
import type { TaxConfiguration } from "@/lib/settings";

export const defaultTaxConfiguration: TaxConfiguration = {
  enabled: true,
  appliesToPos: true,
  appliesToRooms: true,
  graEVatRate: 0,
  vatRate: 12.5,
  nhilRate: 2.5,
  getFundRate: 2.5,
  covidLevyRate: 1,
};

export async function getTaxConfiguration(): Promise<TaxConfiguration> {
  const result = await query("SELECT data FROM settings WHERE id = 1");
  const configured = result.rows[0]?.data?.system?.taxConfiguration;
  return { ...defaultTaxConfiguration, ...(configured || {}) };
}

export function calculateTaxes(subtotal: number, config: TaxConfiguration, module: "pos" | "rooms") {
  const applies = config.enabled && (module === "pos" ? config.appliesToPos : config.appliesToRooms);
  if (!applies || subtotal <= 0) return { subtotal, tax: 0, total: subtotal, breakdown: {} };
  const breakdown = {
    graEVat: subtotal * (Number(config.graEVatRate) / 100),
    vat: subtotal * (Number(config.vatRate) / 100),
    nhil: subtotal * (Number(config.nhilRate) / 100),
    getFund: subtotal * (Number(config.getFundRate) / 100),
    covidLevy: subtotal * (Number(config.covidLevyRate) / 100),
  };
  const tax = Object.values(breakdown).reduce((sum, amount) => sum + amount, 0);
  return { subtotal, tax, total: subtotal + tax, breakdown };
}

export function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
