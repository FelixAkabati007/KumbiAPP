export type InventoryDimension = "mass" | "volume" | "count" | "unknown";

// Canonical unit codes. Every recognized spelling (full word, plural, abbreviation) used
// anywhere in the app — inventory items, recipe ingredients, purchase packaging — must
// resolve to one of these via UNIT_ALIASES, or conversion/sync silently fails.
const FACTORS: Record<string, { dimension: InventoryDimension; toBase: number }> = {
  g: { dimension: "mass", toBase: 1 }, kg: { dimension: "mass", toBase: 1000 }, oz: { dimension: "mass", toBase: 28.349523125 }, lb: { dimension: "mass", toBase: 453.59237 },
  ml: { dimension: "volume", toBase: 1 }, l: { dimension: "volume", toBase: 1000 }, fl_oz: { dimension: "volume", toBase: 29.5735295625 }, qt: { dimension: "volume", toBase: 946.352946 }, gal: { dimension: "volume", toBase: 3785.411784 },
  unit: { dimension: "count", toBase: 1 },
};

// Maps real-world unit spellings (as stored on inventory items, recipe ingredients, and
// purchase packaging) to a canonical FACTORS key. Discrete packaging units (bags, boxes,
// rolls, trays, pieces, etc.) are countable and map to "unit" — they cannot be converted
// to mass/volume since each one may contain a different amount of product.
const UNIT_ALIASES: Record<string, keyof typeof FACTORS> = {
  g: "g", gram: "g", grams: "g", gramme: "g", grammes: "g",
  kg: "kg", kilogram: "kg", kilograms: "kg", kilo: "kg", kilos: "kg",
  oz: "oz", ounce: "oz", ounces: "oz",
  lb: "lb", lbs: "lb", pound: "lb", pounds: "lb",
  ml: "ml", millilitre: "ml", millilitres: "ml", milliliter: "ml", milliliters: "ml",
  l: "l", litre: "l", litres: "l", liter: "l", liters: "l",
  fl_oz: "fl_oz", "fl oz": "fl_oz", "fluid ounce": "fl_oz", "fluid ounces": "fl_oz",
  qt: "qt", quart: "qt", quarts: "qt",
  gal: "gal", gallon: "gal", gallons: "gal",
  unit: "unit", units: "unit", piece: "unit", pieces: "unit", each: "unit", ea: "unit", ct: "unit", count: "unit", counts: "unit", pc: "unit", pcs: "unit", item: "unit", items: "unit",
  bag: "unit", bags: "unit", box: "unit", boxes: "unit", roll: "unit", rolls: "unit",
  tray: "unit", trays: "unit", pack: "unit", packs: "unit", pallet: "unit", pallets: "unit",
  can: "unit", cans: "unit", bottle: "unit", bottles: "unit", sack: "unit", sacks: "unit",
  crate: "unit", crates: "unit", carton: "unit", cartons: "unit",
};

function resolveUnitKey(unit?: string | null): keyof typeof FACTORS | null {
  const normalized = String(unit || "").trim().toLowerCase();
  return UNIT_ALIASES[normalized] ?? (normalized in FACTORS ? (normalized as keyof typeof FACTORS) : null);
}

export function getInventoryUnitDimension(unit?: string | null): InventoryDimension {
  const key = resolveUnitKey(unit);
  return key ? FACTORS[key].dimension : "unknown";
}

export function getInventoryDeductionQuantity(quantity: number, fromUnit?: string | null, toUnit?: string | null, densityGPerMl?: number | null): number | null {
  const fromKey = resolveUnitKey(fromUnit);
  const toKey = resolveUnitKey(toUnit);
  const from = fromKey ? FACTORS[fromKey] : undefined;
  const to = toKey ? FACTORS[toKey] : undefined;
  if (!from || !to || !Number.isFinite(quantity) || quantity < 0) return null;
  if (from.dimension === to.dimension) return quantity * from.toBase / to.toBase;
  // Countable units (bags, boxes, pieces, etc.) cannot convert to mass/volume: each unit
  // may contain a different amount of product, so there is no safe conversion factor.
  if (from.dimension === "count" || to.dimension === "count") return null;
  if (densityGPerMl && densityGPerMl > 0 && from.dimension === "mass" && to.dimension === "volume") return quantity * from.toBase / densityGPerMl / to.toBase;
  if (densityGPerMl && densityGPerMl > 0 && from.dimension === "volume" && to.dimension === "mass") return quantity * from.toBase * densityGPerMl / to.toBase;
  return null;
}

export function getRecipeDeductionQuantity(quantity: number, recipeUnit?: string | null, stockUnit?: string | null, recipeUnitPerStockUnit?: number | null, densityGPerMl?: number | null): number | null {
  if (!Number.isFinite(quantity) || quantity < 0) return null;
  const ratio = Number(recipeUnitPerStockUnit);
  const recipeKey = resolveUnitKey(recipeUnit);
  const stockKey = resolveUnitKey(stockUnit);
  if (recipeKey && stockKey && recipeKey === stockKey) return quantity;
  if (Number.isFinite(ratio) && ratio > 0) {
    if (recipeKey && stockKey && FACTORS[recipeKey].dimension === FACTORS[stockKey].dimension) {
      return quantity / ratio;
    }
  }
  return getInventoryDeductionQuantity(quantity, recipeUnit, stockUnit, densityGPerMl);
}

export function isInventoryBaseUnit(unit?: string | null): boolean {
  return ["g", "ml", "unit"].includes(resolveUnitKey(unit) || "");
}

export const INVENTORY_BASE_UNIT_OPTIONS = [
  { value: "g", label: "Grams (solid)" },
  { value: "ml", label: "Millilitres (liquid)" },
  { value: "unit", label: "Units (countable)" },
] as const;

export const INVENTORY_DENSITY_NOTE = "Density is required only when converting between mass and volume.";

export function normalizeToBase(quantity: number, unit?: string | null, baseUnit?: string | null, densityGPerMl?: number | null): number | null {
  return getInventoryDeductionQuantity(quantity, unit, baseUnit, densityGPerMl);
}

export function isInventoryUnit(unit?: string | null): boolean {
  return Boolean(resolveUnitKey(unit));
}

export function validateInventoryNumber(value: unknown, label: string): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (!Number.isFinite(Number(value)) || Number(value) < 0) return `${label} must be a non-negative number`;
  return null;
}

export function getInventoryUnitFactor(unit: string): number | null {
  const key = resolveUnitKey(unit);
  return key ? FACTORS[key].toBase : null;
}

export function getInventoryUnitBase(unit: string): InventoryDimension {
  return getInventoryUnitDimension(unit);
}

export function getInventoryBaseUnit(unit?: string | null): string | null {
  const dimension = getInventoryUnitDimension(unit);
  return dimension === "mass" ? "g" : dimension === "volume" ? "ml" : dimension === "count" ? "unit" : null;
}

export function getInventoryDisplayUnit(unit?: string | null): string {
  return unit || "units";
}

export function getInventoryConversion(quantity: number, fromUnit: string, toUnit: string, densityGPerMl?: number | null): number | null {
  return getInventoryDeductionQuantity(quantity, fromUnit, toUnit, densityGPerMl);
}

export function canConvertInventoryUnits(fromUnit?: string | null, toUnit?: string | null, densityGPerMl?: number | null): boolean {
  return getInventoryDeductionQuantity(1, fromUnit, toUnit, densityGPerMl) !== null;
}

export function getInventoryUnitLabel(unit?: string | null): string {
  return unit || "units";
}

export function getInventoryUnitOptions() {
  return Object.keys(FACTORS);
}

export function getInventoryDimensionLabel(dimension: InventoryDimension): string {
  return dimension === "mass" ? "solid" : dimension === "volume" ? "liquid" : dimension === "count" ? "countable" : "unknown";
}

export function isCompatibleInventoryUnit(fromUnit?: string | null, toUnit?: string | null, densityGPerMl?: number | null): boolean {
  return canConvertInventoryUnits(fromUnit, toUnit, densityGPerMl);
}

export function getInventoryBaseUnitForDimension(dimension: InventoryDimension): string | null {
  return dimension === "mass" ? "g" : dimension === "volume" ? "ml" : dimension === "count" ? "unit" : null;
}

export function getInventoryQuantityInBase(quantity: number, unit?: string | null, densityGPerMl?: number | null): number | null {
  const base = getInventoryBaseUnit(unit);
  return base ? normalizeToBase(quantity, unit, base, densityGPerMl) : null;
}

export function formatInventoryQuantity(quantity: number, unit?: string | null): string {
  return `${Number(quantity.toFixed(3))} ${getInventoryDisplayUnit(unit)}`;
}

export function getInventoryUnitHelp(unit?: string | null): string {
  return `${getInventoryDimensionLabel(getInventoryUnitDimension(unit))} inventory`;
}

export function isCanonicalBaseUnit(unit?: string | null): boolean {
  return isInventoryBaseUnit(unit);
}

export function getDensityRequirement(fromUnit?: string | null, toUnit?: string | null): boolean {
  return getInventoryUnitDimension(fromUnit) !== getInventoryUnitDimension(toUnit) && getInventoryUnitDimension(fromUnit) !== "unknown" && getInventoryUnitDimension(toUnit) !== "unknown";
}

export function getCanonicalUnit(unit?: string | null): string | null {
  return getInventoryBaseUnit(unit);
}

export function getCanonicalQuantity(quantity: number, unit?: string | null, densityGPerMl?: number | null): number | null {
  return getInventoryQuantityInBase(quantity, unit, densityGPerMl);
}

export function getUnitConversionError(fromUnit?: string | null, toUnit?: string | null): string | null {
  return canConvertInventoryUnits(fromUnit, toUnit) ? null : `Cannot convert ${fromUnit || "unknown"} to ${toUnit || "unknown"} without density`;
}

export function getSupportedInventoryUnits(): string[] {
  return Object.keys(FACTORS);
}

export function getBaseUnitFor(unit?: string | null): string | null {
  return getInventoryBaseUnit(unit);
}

export function getUnitDimension(unit?: string | null): InventoryDimension {
  return getInventoryUnitDimension(unit);
}

export function convertInventoryQuantity(quantity: number, fromUnit?: string | null, toUnit?: string | null, densityGPerMl?: number | null): number | null {
  return getInventoryDeductionQuantity(quantity, fromUnit, toUnit, densityGPerMl);
}

export function isSupportedInventoryUnit(unit?: string | null): boolean {
  return isInventoryUnit(unit);
}

export function getInventoryBaseUnits() {
  return INVENTORY_BASE_UNIT_OPTIONS;
}

export function getDensityGPerMl(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

export function getCanonicalInventoryUnit(unit?: string | null): string | null {
  return getInventoryBaseUnit(unit);
}

export function getInventoryQuantityForUnit(quantity: number, fromUnit: string, toUnit: string, densityGPerMl?: number | null): number | null {
  return getInventoryDeductionQuantity(quantity, fromUnit, toUnit, densityGPerMl);
}

export function getInventoryUnitDescription(unit?: string | null): string {
  return getInventoryUnitHelp(unit);
}

export function hasDensityForConversion(fromUnit?: string | null, toUnit?: string | null, densityGPerMl?: number | null): boolean {
  return !getDensityRequirement(fromUnit, toUnit) || Boolean(densityGPerMl && densityGPerMl > 0);
}

export function convertToCanonicalUnit(quantity: number, unit?: string | null, densityGPerMl?: number | null): number | null {
  return getInventoryQuantityInBase(quantity, unit, densityGPerMl);
}

export function getCanonicalInventoryUnitLabel(unit?: string | null): string {
  return getInventoryUnitLabel(getInventoryBaseUnit(unit));
}

export function getInventoryUnitCategory(unit?: string | null): InventoryDimension {
  return getInventoryUnitDimension(unit);
}

export function getInventoryUnitConversion(quantity: number, fromUnit?: string | null, toUnit?: string | null, densityGPerMl?: number | null): number | null {
  return convertInventoryQuantity(quantity, fromUnit, toUnit, densityGPerMl);
}

export function getInventoryQuantityForBaseUnit(quantity: number, unit?: string | null, densityGPerMl?: number | null): number | null {
  return convertToCanonicalUnit(quantity, unit, densityGPerMl);
}

export function getInventoryBaseUnitLabel(unit?: string | null): string {
  return getInventoryUnitLabel(getInventoryBaseUnit(unit));
}

export function getInventoryUnitConversionError(fromUnit?: string | null, toUnit?: string | null, densityGPerMl?: number | null): string | null {
  return getInventoryDeductionQuantity(1, fromUnit, toUnit, densityGPerMl) === null ? `Cannot safely convert ${fromUnit || "unknown"} to ${toUnit || "unknown"}` : null;
}

export function getInventoryUnitMeta(unit?: string | null) {
  return { unit: unit || null, dimension: getInventoryUnitDimension(unit), baseUnit: getInventoryBaseUnit(unit) };
}

export function getInventoryBaseUnitOptions() {
  return INVENTORY_BASE_UNIT_OPTIONS;
}

export function getInventoryDensityHelp(): string {
  return INVENTORY_DENSITY_NOTE;
}

export function isValidInventoryBaseUnit(unit?: string | null): boolean {
  return isInventoryBaseUnit(unit);
}

export function getInventoryUnitConversionFactor(unit?: string | null): number | null {
  return unit ? getInventoryUnitFactor(unit) : null;
}

export function getInventoryQuantityDifference(before: number, after: number): number {
  return after - before;
}

export function getInventoryUnitDimensionName(unit?: string | null): string {
  return getInventoryDimensionLabel(getInventoryUnitDimension(unit));
}

export function getInventoryCanonicalQuantity(quantity: number, unit?: string | null, densityGPerMl?: number | null): number | null {
  return getInventoryQuantityInBase(quantity, unit, densityGPerMl);
}

export function getInventoryCanonicalUnit(unit?: string | null): string | null {
  return getInventoryBaseUnit(unit);
}

export function getInventoryUnitSupportsDensity(unit?: string | null): boolean {
  return getInventoryUnitDimension(unit) === "mass" || getInventoryUnitDimension(unit) === "volume";
}

export function getInventoryUnitPair(fromUnit?: string | null, toUnit?: string | null) {
  return { from: fromUnit || null, to: toUnit || null, compatible: canConvertInventoryUnits(fromUnit, toUnit) };
}

export function getInventorySyncDescription(unit?: string | null): string {
  return `Stored in ${getInventoryBaseUnit(unit) || unit || "units"}`;
}

export function getInventoryUnitConversionDescription(fromUnit?: string | null, toUnit?: string | null): string {
  return `${fromUnit || "unknown"} → ${toUnit || "unknown"}`;
}

export function getInventoryUnitDimensionForUnit(unit?: string | null): InventoryDimension {
  return getInventoryUnitDimension(unit);
}

export function getInventoryUnitConversionResult(quantity: number, fromUnit?: string | null, toUnit?: string | null, densityGPerMl?: number | null): number | null {
  return getInventoryDeductionQuantity(quantity, fromUnit, toUnit, densityGPerMl);
}

export function getInventoryCanonicalQuantityForDisplay(quantity: number, unit?: string | null, densityGPerMl?: number | null): number | null {
  return getInventoryQuantityInBase(quantity, unit, densityGPerMl);
}

export function getInventoryUnitIsCompatible(fromUnit?: string | null, toUnit?: string | null, densityGPerMl?: number | null): boolean {
  return canConvertInventoryUnits(fromUnit, toUnit, densityGPerMl);
}

export function getInventoryUnitConversionValue(quantity: number, fromUnit?: string | null, toUnit?: string | null, densityGPerMl?: number | null): number | null {
  return convertInventoryQuantity(quantity, fromUnit, toUnit, densityGPerMl);
}

export function getInventoryUnitConversionLabel(fromUnit?: string | null, toUnit?: string | null): string {
  return getInventoryUnitConversionDescription(fromUnit, toUnit);
}

export function getInventoryUnitValidation(unit?: string | null): boolean {
  return isInventoryUnit(unit);
}

export function getInventoryUnitCanonical(unit?: string | null): string | null {
  return getInventoryBaseUnit(unit);
}

export function getInventoryUnitBaseLabel(unit?: string | null): string {
  return getInventoryBaseUnitLabel(unit);
}

export function getInventoryUnitConversionAllowed(fromUnit?: string | null, toUnit?: string | null, densityGPerMl?: number | null): boolean {
  return canConvertInventoryUnits(fromUnit, toUnit, densityGPerMl);
}

export function getInventoryUnitConversionSafe(fromUnit?: string | null, toUnit?: string | null): boolean {
  return canConvertInventoryUnits(fromUnit, toUnit);
}

export function getInventoryUnitConversionNeedsDensity(fromUnit?: string | null, toUnit?: string | null): boolean {
  return getDensityRequirement(fromUnit, toUnit);
}
