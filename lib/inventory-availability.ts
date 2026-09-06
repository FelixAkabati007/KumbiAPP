export type InventoryAvailabilityInput = {
  quantity: number | string | null | undefined
  category?: string | null
  menuItemId?: string | null
}

export function isInventorySellable(input: InventoryAvailabilityInput) {
  return input.category === "ingredient" || input.category === "beverage" || Boolean(input.menuItemId)
}

export function isInventoryAvailable(input: InventoryAvailabilityInput) {
  return !isInventorySellable(input) || Number(input.quantity ?? 0) > 0
}

export function getInventoryAvailability(input: InventoryAvailabilityInput) {
  if (!isInventorySellable(input)) return "internal"
  return Number(input.quantity ?? 0) > 0 ? "available" : "out_of_stock"
}
