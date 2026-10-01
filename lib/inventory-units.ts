const MASS_TO_GRAMS: Record<string, number> = { g: 1, kg: 1000, oz: 28.3495, lb: 453.592 }
const VOLUME_TO_ML: Record<string, number> = { ml: 1, l: 1000, fl_oz: 29.5735, qt: 946.353, gal: 3785.41 }

export type InventoryUnitConversion = { quantity: number; dimension: "mass" | "volume" | "count" }

export function convertInventoryQuantity(quantity: number, fromUnit: string, toUnit: string): InventoryUnitConversion | null {
  if (!Number.isFinite(quantity) || quantity < 0) return null
  if (fromUnit === toUnit) return { quantity, dimension: "count" }
  if (MASS_TO_GRAMS[fromUnit] && MASS_TO_GRAMS[toUnit]) {
    return { quantity: (quantity * MASS_TO_GRAMS[fromUnit]) / MASS_TO_GRAMS[toUnit], dimension: "mass" }
  }
  if (VOLUME_TO_ML[fromUnit] && VOLUME_TO_ML[toUnit]) {
    return { quantity: (quantity * VOLUME_TO_ML[fromUnit]) / VOLUME_TO_ML[toUnit], dimension: "volume" }
  }
  return null
}

export function canDeductInventoryQuantity(available: number, availableUnit: string, required: number, requiredUnit: string) {
  const converted = convertInventoryQuantity(required, requiredUnit, availableUnit)
  return converted ? available >= converted.quantity : false
}

export function getInventoryDeductionQuantity(required: number, requiredUnit: string, inventoryUnit: string) {
  return convertInventoryQuantity(required, requiredUnit, inventoryUnit)?.quantity ?? null
}

export function getInventoryUnitDimension(unit: string) {
  if (MASS_TO_GRAMS[unit]) return "mass"
  if (VOLUME_TO_ML[unit]) return "volume"
  return "count"
}

export { MASS_TO_GRAMS, VOLUME_TO_ML }

// Cross-dimension conversions such as grams to gallons require a density or
// concentration configured for the specific inventory item and are not guessed.
