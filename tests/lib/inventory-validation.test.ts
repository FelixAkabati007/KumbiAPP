import { describe, expect, it } from "vitest";
import {
  isInventoryUnit,
  validateInventoryNumber,
} from "@/lib/inventory-validation";
import {
  convertInventoryQuantity,
  getInventoryUnitCompatibilityError,
  getInventoryUnitSqlExpression,
  normalizeInventoryUnit,
} from "@/lib/inventory-units";

describe("inventory validation", () => {
  it("accepts zero and decimal quantities", () => {
    expect(validateInventoryNumber(0, "quantity")).toBeNull();
    expect(validateInventoryNumber("2.5", "quantity")).toBeNull();
  });
  it("rejects invalid numeric values", () => {
    expect(validateInventoryNumber(-1, "quantity")).toContain("non-negative");
    expect(validateInventoryNumber("nope", "quantity")).toContain(
      "non-negative",
    );
  });
  it("accepts supported units only", () => {
    expect(isInventoryUnit("kg")).toBe(true);
    expect(isInventoryUnit("unknown")).toBe(false);
  });
  it("normalizes countable aliases to the canonical unit", () => {
    expect(normalizeInventoryUnit("each")).toBe("unit");
    expect(normalizeInventoryUnit("pk")).toBe("unit");
  });
  it("rejects unsafe cross-dimension conversions", () => {
    expect(getInventoryUnitCompatibilityError("each", "kg")).toContain(
      "Cannot convert",
    );
    expect(getInventoryUnitCompatibilityError("g", "kg")).toBeNull();
    expect(getInventoryUnitCompatibilityError("ml", "g")).toContain("density");
  });
  it("converts recipe quantities into stock units", () => {
    expect(convertInventoryQuantity(500, "g", "kg")).toBe(0.5);
    expect(convertInventoryQuantity(250, "ml", "l")).toBe(0.25);
    expect(convertInventoryQuantity(2, "each", "unit")).toBe(2);
  });
  it("uses a trusted canonical alias expression for SQL rule matching", () => {
    const expression = getInventoryUnitSqlExpression("i.unit");
    expect(expression).toContain("LOWER(TRIM(i.unit))");
    expect(expression).toContain("'box'");
  });
});
