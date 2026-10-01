import { getRecipeDeductionQuantity } from "@/lib/inventory-units";

export type InventoryCostStatus =
  | "priced"
  | "missing_cost"
  | "unit_conversion_missing"
  | "invalid_inventory_setup";

export type InventoryCostResult = {
  status: InventoryCostStatus;
  requiredInventoryQuantity: number | null;
  costPerInventoryUnit: number;
  lineCost: number | null;
  reason: string | null;
};

export function calculateInventoryLineCost(input: {
  recipeQuantity: number;
  recipeUnit?: string | null;
  inventoryUnit?: string | null;
  conversionRatio?: number | string | null;
  densityGPerMl?: number | string | null;
  costPerInventoryUnit?: number | string | null;
}): InventoryCostResult {
  const quantity = Number(input.recipeQuantity);
  const cost = Number(input.costPerInventoryUnit ?? 0);
  const density = input.densityGPerMl == null || input.densityGPerMl === "" ? null : Number(input.densityGPerMl);
  const ratio = input.conversionRatio == null || input.conversionRatio === "" ? null : Number(input.conversionRatio);

  if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(cost) || cost < 0) {
    return { status: "invalid_inventory_setup", requiredInventoryQuantity: null, costPerInventoryUnit: 0, lineCost: null, reason: "Recipe quantity or inventory cost is invalid." };
  }
  if (cost === 0) {
    return { status: "missing_cost", requiredInventoryQuantity: null, costPerInventoryUnit: cost, lineCost: null, reason: "Set a purchase cost and quantity per container on this Inventory Item." };
  }

  const required = getRecipeDeductionQuantity(quantity, input.recipeUnit, input.inventoryUnit, ratio, density);
  if (required === null || !Number.isFinite(required) || required < 0) {
    return { status: "unit_conversion_missing", requiredInventoryQuantity: null, costPerInventoryUnit: cost, lineCost: null, reason: `Recipe unit ${input.recipeUnit ?? "(missing)"} cannot be converted to inventory unit ${input.inventoryUnit ?? "(missing)"}.` };
  }

  return { status: "priced", requiredInventoryQuantity: required, costPerInventoryUnit: cost, lineCost: required * cost, reason: null };
}

export function calculateCostPerInventoryUnit(costPerContainer: unknown, quantityPerContainer: unknown) {
  const cost = Number(costPerContainer);
  const quantity = Number(quantityPerContainer);
  if (!Number.isFinite(cost) || cost < 0 || !Number.isFinite(quantity) || quantity <= 0) return null;
  return cost / quantity;
}

export function getInventoryCostValidationError(costPerContainer: unknown, quantityPerContainer: unknown) {
  const cost = Number(costPerContainer);
  const quantity = Number(quantityPerContainer);
  if (Number.isFinite(cost) && cost > 0 && (!Number.isFinite(quantity) || quantity <= 0)) {
    return "Quantity per container must be greater than zero when a container cost is set.";
  }
  return null;
}

// Shared server/client calculation contract; the trailing export keeps this module tree-shakeable.
export const INVENTORY_COST_VERSION = "1";
