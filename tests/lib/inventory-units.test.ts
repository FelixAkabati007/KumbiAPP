import { describe, expect, it } from "vitest";
import {
  canConvertInventoryUnits,
  getCompatibleRecipeUnits,
  getInventoryUnitCompatibilityError,
  getInventoryUnitDimension,
  getRecipeDeductionQuantity,
  isInventoryUnit,
  requiresChefYield,
} from "@/lib/inventory-units";

describe("shared inventory unit model", () => {
  it("groups automatic units by measurement family", () => {
    expect(getCompatibleRecipeUnits("kg").map((unit) => unit.value)).toEqual(["g", "kg", "oz", "lb", "slice", "ladle", "scoop", "pinch", "tsp", "tbsp"]);
    expect(getCompatibleRecipeUnits("l")[0]).toMatchObject({ value: "ml", kind: "automatic" });
    expect(getCompatibleRecipeUnits("pack")).toEqual(expect.arrayContaining([expect.objectContaining({ value: "unit", kind: "automatic" })]));
  });

  it("marks chef units as explicit-yield conversions", () => {
    expect(requiresChefYield("kg", "slice")).toBe(true);
    expect(requiresChefYield("kg", "g")).toBe(false);
    expect(getInventoryUnitDimension("slice")).toBe("count");
    expect(isInventoryUnit("ladles")).toBe(true);
  });

  it("accepts matching automatic units and rejects incompatible units", () => {
    expect(canConvertInventoryUnits("kg", "g")).toBe(true);
    expect(canConvertInventoryUnits("kg", "slice")).toBe(false);
    expect(getInventoryUnitCompatibilityError("kg", "g")).toBeNull();
    expect(getInventoryUnitCompatibilityError("kg", "slice")).toContain("Cannot convert");
  });
});

describe("5-star industry standard recipe deduction engine", () => {
  it("accurately converts same-dimension mass units (g -> kg, oz -> lb) without being corrupted by default ratio 1", () => {
    // 250 grams from a 10 kg stock item with default DB ratio=1 must deduct 0.25 kg, NOT 250 kg!
    const result = getRecipeDeductionQuantity(250, "g", "kg", 1, null);
    expect(result).toBeCloseTo(0.25, 4);

    // 8 oz from a 50 lb sack with ratio=1 must deduct 0.5 lb
    const ozResult = getRecipeDeductionQuantity(8, "oz", "lb", 1, null);
    expect(ozResult).toBeCloseTo(0.5, 3);
  });

  it("accurately converts same-dimension volume units (ml -> L, fl_oz -> L) without being corrupted by pack ratio", () => {
    // 500 ml from a 5 L container with container pack ratio 24 must deduct 0.5 L
    const result = getRecipeDeductionQuantity(500, "ml", "l", 24, null);
    expect(result).toBeCloseTo(0.5, 4);
  });

  it("accurately handles culinary volume measurements (tsp, tbsp -> ml or L)", () => {
    // 1 tsp = 4.92892 ml
    const tspMl = getRecipeDeductionQuantity(1, "tsp", "ml");
    expect(tspMl).toBeCloseTo(4.92892, 3);

    // 2 tbsp to L (1 tbsp = 14.7868 ml, 2 tbsp = 29.5736 ml = 0.0295736 L)
    const tbspL = getRecipeDeductionQuantity(2, "tbsp", "l");
    expect(tbspL).toBeCloseTo(0.0295736, 4);
  });

  it("converts cross-dimensional mass and volume using density", () => {
    // 100 ml honey (density 1.42 g/ml) from kg stock
    // 100 ml * 1.42 g/ml = 142 g = 0.142 kg
    const honeyDeduction = getRecipeDeductionQuantity(100, "ml", "kg", null, 1.42);
    expect(honeyDeduction).toBeCloseTo(0.142, 4);

    // 500 g cooking oil (density 0.92 g/ml) from L stock
    // 500 g / 0.92 = 543.478 ml = 0.543478 L
    const oilDeduction = getRecipeDeductionQuantity(500, "g", "l", null, 0.92);
    expect(oilDeduction).toBeCloseTo(0.543478, 4);
  });

  it("accurately handles chef yield portioning (slices, portions, scoops)", () => {
    // Bread loaf yields 20 slices per loaf. Recipe requires 2 slices.
    // Deduction must be 2 / 20 = 0.1 loaf.
    const breadResult = getRecipeDeductionQuantity(2, "slice", "unit", 20, null);
    expect(breadResult).toBeCloseTo(0.1, 4);

    // Ice cream tub yields 30 scoops. Recipe requires 3 scoops.
    // Deduction must be 3 / 30 = 0.1 tub.
    const scoopResult = getRecipeDeductionQuantity(3, "scoop", "unit", 30, null);
    expect(scoopResult).toBeCloseTo(0.1, 4);
  });

  it("applies butchery/prep yield factor (< 1) to raw stock requirements", () => {
    // Trimmed beef tenderloin with 80% yield (0.80). Recipe requires 200g trimmed beef, stock in kg.
    // 200g = 0.20 kg. With 80% yield, raw meat required is 0.20 / 0.80 = 0.25 kg.
    const meatResult = getRecipeDeductionQuantity(200, "g", "kg", 0.80, null);
    expect(meatResult).toBeCloseTo(0.25, 4);
  });

  it("gracefully returns null for incompatible units without density", () => {
    // Cannot convert grams to milliliters without density
    const invalid = getRecipeDeductionQuantity(100, "g", "ml", null, null);
    expect(invalid).toBeNull();

    // Cannot convert count to mass without chef yield ratio
    const invalidCount = getRecipeDeductionQuantity(2, "slice", "kg", null, null);
    expect(invalidCount).toBeNull();
  });
});
