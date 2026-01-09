# Implementation Plan: Recipe-Based Inventory Deduction (Normalized & Production-Grade)

I have confirmed your system architecture:
1.  **Database**: **PostgreSQL** (verified via `@neondatabase/serverless` usage).
2.  **Architecture**: **Single-Tenant** (verified via `restaurant_profile` constraints and absence of `tenant_id` columns).

Based on this, I have designed a **normalized, transaction-safe solution** that avoids JSON blobs and ensures data integrity for complex Ghanaian dishes.

## Phase 1: Database Normalization (The Foundation)
We will create a strict relational structure to link Menu Items to Inventory Ingredients. This allows for precise queries, joins, and referential integrity.

### New Table: `recipe_ingredients`
This table bridges the gap between what you sell (`menu_items`) and what you buy (`inventory`).

```sql
CREATE TABLE IF NOT EXISTS recipe_ingredients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_item_id UUID NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  inventory_item_id UUID NOT NULL REFERENCES inventory(id) ON DELETE RESTRICT,
  quantity DECIMAL(10, 4) NOT NULL, -- Exact amount to deduct
  unit VARCHAR(20) NOT NULL,        -- Unit used in recipe (e.g., 'grams')
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Prevent duplicate ingredients in the same dish
  UNIQUE(menu_item_id, inventory_item_id) 
);

-- Index for fast lookup during order processing
CREATE INDEX idx_recipe_ingredients_menu_item ON recipe_ingredients(menu_item_id);
```
*Why this is better:* If you delete an inventory item (e.g., "Fresh Tomatoes"), the database will stop you if it's used in a recipe (`ON DELETE RESTRICT`), preventing "ghost" ingredients.

## Phase 2: Core Deduction Logic (The Engine)
We will encapsulate all inventory logic in a dedicated service, isolated from the payment processing code.

### File: `lib/services/inventory-manager.ts`
We will implement a method `deductIngredientsForOrder` that runs within a database transaction.

**Algorithm:**
1.  Receive `OrderId`.
2.  Fetch all items in that order.
3.  For each item, query `recipe_ingredients`.
4.  **IF** recipe exists:
    *   Calculate total needed (Recipe Qty * Order Qty).
    *   `UPDATE inventory SET quantity = quantity - needed WHERE id = ...`
5.  **ELSE** (No recipe):
    *   Fallback to direct deduction (matching Name/SKU) for simple items like "Coke".
6.  **Safety Check**: If stock goes negative, allow it but log a "Stock Deficit" warning (blocking orders due to slight stock mismatches stops business).

## Phase 3: Safe Integration (The Switch)
We will use a "Feature Flag" approach to integrate this into your existing `payment-service.ts` without risking stability.

```typescript
// In lib/services/payment-service.ts
const ENABLE_RECIPE_DEDUCTION = true; // Feature flag

if (ENABLE_RECIPE_DEDUCTION) {
  await inventoryManager.deductIngredientsForOrder(orderId);
} else {
  // ... old legacy logic ...
}
```

## Phase 4: UI for Recipe Management
To make this usable, Chefs need to define these recipes. We will add a **"Recipe" tab** to the existing **Menu Management** dialog.
- **Action**: Update `app/menu/page.tsx` (or the Menu Item Dialog).
- **Features**:
    - Search & Select from Inventory.
    - Enter Quantity & Unit.
    - List current ingredients for the dish.

## Execution Steps
1.  **Create Schema**: Run SQL to create `recipe_ingredients`.
2.  **Create Service**: Implement `InventoryManager` class with strict typing.
3.  **Update UI**: Allow linking Menu Items to Inventory Items.
4.  **Integrate**: Hook the service into the payment flow.
