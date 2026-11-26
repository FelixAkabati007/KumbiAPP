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
  availableUnits: number;
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
  const unitsPerSale = Number(input.directUnitsPerSale ?? 1) > 0 ? Number(input.directUnitsPerSale ?? 1) : 1;

  let computedUnits = 0;
  if (input.inventoryMode === "direct") {
    const available = Math.max(0, Number(input.directQuantity ?? 0));
    computedUnits = Math.max(0, Math.floor((available + 1e-9) / unitsPerSale));
  } else {
    const ingredients = input.ingredients ?? [];
    if (!ingredients.length) {
      const available = Math.max(0, Number(input.legacyQuantity ?? 0));
      computedUnits = Math.max(0, Math.floor((available + 1e-9) / unitsPerSale));
    } else {
      const perIngredientUnits = ingredients.map((ingredient) => {
        const required = getRecipeDeductionQuantity(
          ingredient.requiredQuantity,
          ingredient.recipeUnit,
          ingredient.stockUnit,
          ingredient.conversionRatio,
          ingredient.densityGPerMl,
        );
        const available = Math.max(0, Number(ingredient.availableQuantity ?? 0));
        if (required === null || required <= 0) return 0;
        return Math.max(0, Math.floor((available + 1e-9) / required));
      });
      computedUnits = perIngredientUnits.length > 0 ? Math.min(...perIngredientUnits) : 0;
    }
  }

  if (input.availabilityMode === "manual" && !input.isAvailable) {
    return {
      inStock: false,
      availableUnits: computedUnits,
      stockStatus: "manually_unavailable",
      stockShortages: [],
      shortageDetails: [],
    };
  }
  if (input.inventoryMode === "direct") {
    const required = unitsPerSale;
    const available = Number(input.directQuantity ?? 0);
    const short = available < required;
    return {
      inStock: !short,
      availableUnits: computedUnits,
      stockStatus: short ? "out_of_stock" : "available",
      stockShortages: short ? ["Direct inventory"] : [],
      shortageDetails: short
        ? [{ name: "Direct inventory", reason: "insufficient_stock", requiredQuantity: required, availableQuantity: available }]
        : [],
    };
  }
  const ingredients = input.ingredients ?? [];
  if (!ingredients.length) {
    const availableLegacy = Number(input.legacyQuantity ?? 0);
    const hasLegacyStock = availableLegacy >= unitsPerSale && availableLegacy > 0;
    return {
      inStock: hasLegacyStock,
      availableUnits: computedUnits,
      stockStatus: hasLegacyStock ? "available" : "recipe_required",
      stockShortages: hasLegacyStock ? [] : ["Recipe ingredients"],
      shortageDetails: hasLegacyStock ? [] : [{ name: "Recipe ingredients", reason: "recipe_required" }],
    };
  }
  const shortageDetails = ingredients.flatMap((ingredient) => {
    const required = getRecipeDeductionQuantity(ingredient.requiredQuantity, ingredient.recipeUnit, ingredient.stockUnit, ingredient.conversionRatio, ingredient.densityGPerMl);
    const available = Number(ingredient.availableQuantity ?? 0);
    if (required === null) return [{ name: ingredient.name, reason: "invalid_unit_conversion", recipeUnit: ingredient.recipeUnit, stockUnit: ingredient.stockUnit }];
    if (available < required) return [{ name: ingredient.name, reason: "insufficient_stock", requiredQuantity: required, availableQuantity: available, recipeUnit: ingredient.recipeUnit, stockUnit: ingredient.stockUnit }];
    return [];
  });
  return {
    inStock: shortageDetails.length === 0,
    availableUnits: shortageDetails.length === 0 ? computedUnits : 0,
    stockStatus: shortageDetails.length ? "out_of_stock" : "available",
    stockShortages: shortageDetails.map((item) => item.name),
    shortageDetails,
  };
}
