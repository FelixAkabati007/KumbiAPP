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

export function isInventoryUnit(value: unknown): value is (typeof INVENTORY_UNITS)[number] {
  return typeof value === "string" && (INVENTORY_UNITS as readonly string[]).includes(value)
}
