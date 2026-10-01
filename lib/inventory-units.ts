export type InventoryDimension = "mass" | "volume" | "count" | "unknown";

const FACTORS: Record<string, { dimension: InventoryDimension; toBase: number }> = {
  g: { dimension: "mass", toBase: 1 }, kg: { dimension: "mass", toBase: 1000 }, oz: { dimension: "mass", toBase: 28.349523125 }, lb: { dimension: "mass", toBase: 453.59237 },
  ml: { dimension: "volume", toBase: 1 }, l: { dimension: "volume", toBase: 1000 }, fl_oz: { dimension: "volume", toBase: 29.5735295625 }, qt: { dimension: "volume", toBase: 946.352946 }, gal: { dimension: "volume", toBase: 3785.411784 },
  unit: { dimension: "count", toBase: 1 }, units: { dimension: "count", toBase: 1 }, piece: { dimension: "count", toBase: 1 }, pieces: { dimension: "count", toBase: 1 }, each: { dimension: "count", toBase: 1 },
};

export function getInventoryUnitDimension(unit?: string | null): InventoryDimension {
  return FACTORS[String(unit || "").toLowerCase()]?.dimension || "unknown";
}

export function getInventoryDeductionQuantity(quantity: number, fromUnit?: string | null, toUnit?: string | null, densityGPerMl?: number | null): number | null {
  const from = FACTORS[String(fromUnit || "").toLowerCase()];
  const to = FACTORS[String(toUnit || "").toLowerCase()];
  if (!from || !to || !Number.isFinite(quantity) || quantity < 0) return null;
  if (from.dimension === to.dimension) return quantity * from.toBase / to.toBase;
  if (densityGPerMl && densityGPerMl > 0 && from.dimension === "mass" && to.dimension === "volume") return quantity * from.toBase / densityGPerMl / to.toBase;
  if (densityGPerMl && densityGPerMl > 0 && from.dimension === "volume" && to.dimension === "mass") return quantity * from.toBase * densityGPerMl / to.toBase;
  return null;
}

export function isInventoryBaseUnit(unit?: string | null): boolean {
  return ["g", "ml", "unit"].includes(String(unit || "").toLowerCase());
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
  return Boolean(FACTORS[String(unit || "").toLowerCase()]);
}

export function validateInventoryNumber(value: unknown, label: string): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (!Number.isFinite(Number(value)) || Number(value) < 0) return `${label} must be a non-negative number`;
  return null;
}

export function getInventoryUnitFactor(unit: string): number | null {
  return FACTORS[unit]?.toBase ?? null;
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
