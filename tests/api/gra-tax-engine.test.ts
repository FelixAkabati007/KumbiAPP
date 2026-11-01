import { describe, it, expect } from "vitest";
import { calculateTaxes, defaultTaxConfiguration } from "@/lib/tax";
import {
  levyRows,
  graFiscalHeaderHtml,
  graFiscalFooterHtml,
} from "@/lib/levy-presentation";

describe("GRA Statutory Compounded Tax Engine & E-VAT Compliance", () => {
  it("computes statutory Ghana compounded tax per Act 870 §3, Act 857, Act 581, and Act 817 (Exclusive Mode)", () => {
    const config = {
      ...defaultTaxConfiguration,
      enabled: true,
      pricingMode: "exclusive" as const,
      tin: "C0029384756",
      vatRate: 15.0,
      nhilRate: 2.5,
      getfundRate: 2.5,
      tourismLevyRate: 1.0,
      tourismLevyEnabled: true,
      covidLevyRate: 0,
      covidLevyEnabled: false,
    };

    const subtotal = 100.0;
    const result = calculateTaxes(subtotal, config, "pos");

    // Base Levies
    expect(result.breakdown.taxableBase).toBe(100.0);
    expect(result.breakdown.nhil).toBe(2.5);
    expect(result.breakdown.getfund).toBe(2.5);
    expect(result.breakdown.tourism).toBe(1.0);

    // Compounded VAT Base = 100 + 2.5 + 2.5 + 1.0 = 106.00
    // Standard VAT = 15% of 106.00 = 15.90
    expect(result.breakdown.standardVat).toBe(15.9);

    // Total Statutory Levies & VAT = 2.5 + 2.5 + 1.0 + 15.90 = 21.90
    expect(result.tax).toBe(21.9);
    expect(result.total).toBe(121.9);

    // Effective Rate = 21.9%
    expect(result.effectiveRate).toBe(21.9);
    expect(result.tin).toBe("C0029384756");
  });

  it("accurately back-calculates net taxable base and taxes in Tax-Inclusive Mode", () => {
    const config = {
      ...defaultTaxConfiguration,
      enabled: true,
      pricingMode: "inclusive" as const,
      tin: "C0029384756",
      vatRate: 15.0,
      nhilRate: 2.5,
      getfundRate: 2.5,
      tourismLevyRate: 1.0,
      tourismLevyEnabled: true,
      covidLevyRate: 0,
      covidLevyEnabled: false,
    };

    // A bill where the gross customer total is 121.90
    const grossTotal = 121.9;
    const result = calculateTaxes(grossTotal, config, "pos");

    expect(result.breakdown.taxableBase).toBeCloseTo(100.0, 2);
    expect(result.breakdown.nhil).toBeCloseTo(2.5, 2);
    expect(result.breakdown.getfund).toBeCloseTo(2.5, 2);
    expect(result.breakdown.tourism).toBeCloseTo(1.0, 2);
    expect(result.breakdown.standardVat).toBeCloseTo(15.9, 2);
    expect(result.tax).toBeCloseTo(21.9, 2);
    expect(result.total).toBe(121.9);
  });

  it("yields zero tax when tax engine is disabled", () => {
    const config = {
      ...defaultTaxConfiguration,
      enabled: false,
    };

    const result = calculateTaxes(250.0, config, "pos");
    expect(result.tax).toBe(0);
    expect(result.total).toBe(250.0);
    expect(result.breakdown.totalTax).toBe(0);
  });

  it("formats statutory levy presentation rows with Tourism Levy and without zero-rate placeholder", () => {
    const config = {
      ...defaultTaxConfiguration,
      enabled: true,
      vatRate: 15.0,
      nhilRate: 2.5,
      getfundRate: 2.5,
      tourismLevyRate: 1.0,
      tourismLevyEnabled: true,
    };

    const result = calculateTaxes(100.0, config, "pos");
    const rows = levyRows(result.breakdown, config, 100.0, "₵");

    const labels = rows.map((r) => r.label);
    expect(labels).toContain("NHIL");
    expect(labels).toContain("GETFund");
    expect(labels).toContain("Tourism Levy (GTA)");
    expect(labels).toContain("VAT (Standard)");

    // No confusing "GRA E-VAT (invoice channel): ₵0.00" in levy line items
    expect(labels).not.toContain("GRA E-VAT (invoice channel)");
  });

  it("generates authentic GRA E-VAT Fiscal Compliance Header and Verification Footer", () => {
    const metadata = {
      tin: "C0029384756",
      orderNumber: "ORD-20261101-0099",
      total: 121.9,
      date: "2026-11-01",
    };

    const header = graFiscalHeaderHtml(metadata);
    expect(header).toContain("GRA E-VAT FISCAL RECEIPT");
    expect(header).toContain("TIN: C0029384756");
    expect(header).toContain("SDC ID: SDC-KMB-010099");
    expect(header).toContain("INVOICE: ORD-20261101-0099");

    const footer = graFiscalFooterHtml(metadata);
    expect(footer).toContain("[ GRA E-VAT VERIFIED FISCAL RECEIPT ]");
    expect(footer).toContain("https://efiscal.gra.gov.gh/verify?tin=C0029384756&inv=ORD-20261101-0099&tot=121.90");
    expect(footer).toContain("Powered by KumbiAPP");
  });
});
