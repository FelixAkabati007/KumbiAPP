import { isInventoryUnit as isKnownInventoryUnit } from "./inventory-units"

// Discrete packaging/recipe units that aren't recognized by the mass/volume/count
// conversion system in lib/inventory-units.ts but are still valid unit labels.
export const INVENTORY_UNITS = [
  "cs", "bx", "pk", "bg", "flat", "crate", "tub", "drum", "bbl", "sleeve", "carton", "sack", "bottle", "tin", "tray",
  "ea", "ct", "dz", "item", "piece", "unit", "bulb", "clove", "knob", "bunch", "head", "leaf", "root",
  "lb", "oz", "kg", "g", "gal", "qt", "l", "btl", "can", "fl_oz", "ml", "scoop", "ladle", "slice", "pc", "tsp", "tbsp", "c", "pinch", "yield_percent", "units"
] as const

export function validateInventoryNumber(value: unknown, field: string) {
  if (value === undefined || value === null || value === "") return null
  const number = Number(value)
  return Number.isFinite(number) && number >= 0 ? null : `${field} must be a non-negative number`
}

// Accepts anything recognized by either list, so real-world unit strings already stored
// in the database (e.g. "litres", "bags", "boxes", "rolls", "trays") validate consistently
// with the alias-aware conversion system used for recipe/inventory unit syncing.
export function isInventoryUnit(value: unknown): boolean {
  if (typeof value !== "string") return false
  if ((INVENTORY_UNITS as readonly string[]).includes(value)) return true
  return isKnownInventoryUnit(value)
}
