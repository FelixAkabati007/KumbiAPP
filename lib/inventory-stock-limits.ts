// Maximum on-hand stock quantities, expressed in each item's own stock unit.
// These are operational ceilings for a small Kumasi food-service operation, not
// a cap on the number of items or categories — unmatched categories/items fall
// back to a generous default so adding new inventory later is never blocked.
//
// To extend:
// - Add a keyword to GRAIN_KEYWORDS / ALCOHOL_KEYWORDS to route an item to a
//   tighter preset, or
// - Add a new entry to CATEGORY_MAX_STOCK for a brand-new category, or
// - Leave it alone — DEFAULT_MAX_STOCK keeps anything else usable.

const DEFAULT_MAX_STOCK = 300

const CATEGORY_MAX_STOCK: Record<string, number> = {
  ingredient: 120,
  beverage: 40,
  supply: 150,
}

// Grain/starch staples bought and stored in small batches (5kg bags are the
// common Kumasi wholesale pack size for rice, beans, flour, maize, etc.).
const GRAIN_KEYWORDS = [
  "rice", "beans", "bean", "flour", "maize", "corn", "millet", "sorghum",
  "gari", "semolina", "oat", "wheat", "cassava flour", "yam flour",
]
const GRAIN_MAX_STOCK = 5

// Packaged alcoholic beverages (bottles/packs), e.g. Alomo Bitters variants.
const ALCOHOL_KEYWORDS = ["alomo", "bitters", "beer", "wine", "spirit", "schnapps", "gin", "whisky", "whiskey", "vodka"]
const ALCOHOL_PACK_MAX_STOCK = 2

function matchesKeyword(name: string, keywords: string[]) {
  const normalized = name.toLowerCase()
  return keywords.some((keyword) => normalized.includes(keyword))
}

export function getMaxStockForItem(input: { category?: string | null; name?: string | null }): number {
  const name = input.name ?? ""
  const category = (input.category ?? "").toLowerCase()

  if (category === "ingredient" && matchesKeyword(name, GRAIN_KEYWORDS)) return GRAIN_MAX_STOCK
  if (category === "beverage" && matchesKeyword(name, ALCOHOL_KEYWORDS)) return ALCOHOL_PACK_MAX_STOCK

  return CATEGORY_MAX_STOCK[category] ?? DEFAULT_MAX_STOCK
}

export function validateMaxStock(input: { category?: string | null; name?: string | null; quantity: number }): string | null {
  const max = getMaxStockForItem(input)
  if (input.quantity > max) {
    return `Stock quantity exceeds the maximum allowed for this item (${max}${input.name ? ` for "${input.name}"` : ""}).`
  }
  return null
}
