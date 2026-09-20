import type { InventoryItem } from "@/lib/types";

export const MOCK_INVENTORY_ITEMS: InventoryItem[] = [
  { id: "mock-produce", name: "Fresh Produce Basket", sku: "MOCK-PROD-001", category: "ingredient", quantity: "24", unit: "kg", reorderLevel: "8", cost: "18.00", supplier: "Mock Supplier" },
  { id: "mock-dry-goods", name: "Rice and Pantry Grains", sku: "MOCK-DRY-001", category: "ingredient", quantity: "45", unit: "kg", reorderLevel: "12", cost: "12.50", supplier: "Mock Supplier" },
  { id: "mock-beverage", name: "Assorted Soft Drinks", sku: "MOCK-BEV-001", category: "beverage", quantity: "96", unit: "bottles", reorderLevel: "24", cost: "4.50", supplier: "Mock Supplier" },
  { id: "mock-disposable", name: "Takeout Containers", sku: "MOCK-SUP-001", category: "supply", quantity: "180", unit: "pieces", reorderLevel: "50", cost: "0.80", supplier: "Mock Supplier" },
];

export const MOCK_MENU_ITEMS = [
  { id: "mock-menu-jollof", isAvailable: true, availabilityMode: "automatic", name: "Jollof Rice and Grilled Chicken", description: "House jollof with grilled chicken", price: 85, inStock: true, category: "ghanaian", inventoryMode: "recipe", stockStatus: "available", stockShortages: [] },
  { id: "mock-menu-tilapia", isAvailable: true, availabilityMode: "automatic", name: "Grilled Tilapia", description: "Whole grilled tilapia with sides", price: 120, inStock: true, category: "ghanaian", inventoryMode: "recipe", stockStatus: "available", stockShortages: [] },
  { id: "mock-menu-juice", isAvailable: true, availabilityMode: "automatic", name: "Fresh Tropical Juice", description: "Seasonal fruit blend", price: 28, inStock: true, category: "beverages", inventoryMode: "recipe", stockStatus: "available", stockShortages: [] },
] as const;
