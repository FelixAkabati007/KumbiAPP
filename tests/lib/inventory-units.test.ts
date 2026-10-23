import { describe, expect, it } from "vitest";
import {
  canConvertInventoryUnits,
  getCompatibleRecipeUnits,
  getInventoryUnitCompatibilityError,
  getInventoryUnitDimension,
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
