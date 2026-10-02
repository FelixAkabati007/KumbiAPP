import { getRecipeDeductionQuantity } from "@/lib/inventory-units";

export type AvailabilityIngredient = {
  name: string;
  requiredQuantity: number;
  recipeUnit: string | null;
  availableQuantity: number | null;
  stockUnit: string | null;
  conversionRatio?: number | null;
  densityGPerMl?: number | null;
};

export type MenuAvailability = {
  inStock: boolean;
  stockStatus: "available" | "out_of_stock" | "manually_unavailable" | "recipe_required" | "invalid_recipe_setup";
  stockShortages: string[];
  shortageDetails: Array<{ name: string; reason: string; requiredQuantity?: number; availableQuantity?: number; recipeUnit?: string | null; stockUnit?: string | null }>;
};

export function calculateMenuAvailability(input: {
  inventoryMode: "recipe" | "direct";
  availabilityMode: "manual" | "automatic";
  isAvailable: boolean;
  directQuantity?: number | null;
  directUnitsPerSale?: number | null;
  ingredients?: AvailabilityIngredient[];
  legacyQuantity?: number | null;
}): MenuAvailability {
  if (input.availabilityMode === "manual" && !input.isAvailable) {
    return { inStock: false, stockStatus: "manually_unavailable", stockShortages: [], shortageDetails: [] };
  }
  if (input.inventoryMode === "direct") {
    const required = Number(input.directUnitsPerSale ?? 1);
    const available = Number(input.directQuantity ?? 0);
    const short = available < required;
    return { inStock: !short, stockStatus: short ? "out_of_stock" : "available", stockShortages: short ? ["Direct inventory"] : [], shortageDetails: short ? [{ name: "Direct inventory", reason: "insufficient_stock", requiredQuantity: required, availableQuantity: available }] : [] };
  }
  const ingredients = input.ingredients ?? [];
  if (!ingredients.length) {
    const hasLegacyStock = Number(input.legacyQuantity ?? 0) > 0;
    return { inStock: hasLegacyStock, stockStatus: hasLegacyStock ? "available" : "recipe_required", stockShortages: hasLegacyStock ? [] : ["Recipe ingredients"], shortageDetails: hasLegacyStock ? [] : [{ name: "Recipe ingredients", reason: "recipe_required" }] };
  }
  const shortageDetails = ingredients.flatMap((ingredient) => {
    const required = getRecipeDeductionQuantity(ingredient.requiredQuantity, ingredient.recipeUnit, ingredient.stockUnit, ingredient.conversionRatio, ingredient.densityGPerMl);
    const available = Number(ingredient.availableQuantity ?? 0);
    if (required === null) return [{ name: ingredient.name, reason: "invalid_unit_conversion", recipeUnit: ingredient.recipeUnit, stockUnit: ingredient.stockUnit }];
    if (available < required) return [{ name: ingredient.name, reason: "insufficient_stock", requiredQuantity: required, availableQuantity: available, recipeUnit: ingredient.recipeUnit, stockUnit: ingredient.stockUnit }];
    return [];
  });
  return { inStock: shortageDetails.length === 0, stockStatus: shortageDetails.length ? "out_of_stock" : "available", stockShortages: shortageDetails.map((item) => item.name), shortageDetails };
}
