import { transaction } from "@/lib/db";

export interface InventoryDeductionItem {
  menu_item_id?: string;
  item_name: string;
  quantity: number;
}

export class InventoryManager {
  /**
   * Deducts ingredients from inventory based on the provided items.
   * This runs in a transaction to ensure integrity.
   */
  async deductIngredientsForOrder(
    orderId: string,
    items: InventoryDeductionItem[]
  ): Promise<void> {
    // console.log(`[InventoryManager] Starting deduction for order ${orderId}`);

    if (items.length === 0) {
      console.warn(`[InventoryManager] No items provided for order ${orderId}`);
      return;
    }

    await transaction(async (client) => {
      for (const item of items) {
        // The menu item explicitly controls whether this sale consumes a recipe or direct stock.
        let recipeFound = false;
        let directStockHandled = false;

        if (item.menu_item_id) {
          const modeRes = await client.query(
            `SELECT inventory_mode, direct_inventory_id, direct_units_per_sale
             FROM menu_items WHERE id = $1`,
            [item.menu_item_id]
          );
          const mode = modeRes.rows[0];
          if (mode?.inventory_mode === "direct") {
            if (!mode.direct_inventory_id) throw new Error(`Direct inventory is not configured for ${item.item_name}`);
            await client.query(
              `UPDATE inventory SET quantity = quantity - $1, last_updated = NOW() WHERE id = $2`,
              [Number(mode.direct_units_per_sale) * item.quantity, mode.direct_inventory_id]
            );
            directStockHandled = true;
          }

          const recipeRes = directStockHandled ? { rows: [] } : await client.query(
            `SELECT inventory_item_id, quantity, unit 
             FROM recipe_ingredients 
             WHERE menu_item_id = $1`,
            [item.menu_item_id]
          );

          const ingredients = recipeRes.rows;

          if (ingredients.length > 0) {
            recipeFound = true;
            // Deduct based on recipe
            for (const ingredient of ingredients) {
              const totalDeduction = ingredient.quantity * item.quantity;

              await client.query(
                `UPDATE inventory 
                 SET quantity = quantity - $1, 
                 last_updated = NOW() 
                 WHERE id = $2`,
                [totalDeduction, ingredient.inventory_item_id]
              );

              // console.log(
              //   `[InventoryManager] Deducted ${totalDeduction} ${ingredient.unit} of inventory item ${ingredient.inventory_item_id} for menu item ${item.menu_item_id}`
              // );
            }
          }
        }

        // 2. Fallback: Direct Name/SKU Match (Legacy Mode)
        // Only if no recipe was found/processed
        if (!recipeFound && !directStockHandled) {
          // If no recipe, try to find an inventory item with the exact same name
          const invItemRes = await client.query(
            `SELECT id, quantity FROM inventory WHERE name = $1 LIMIT 1`,
            [item.item_name]
          );

          if (invItemRes.rows.length > 0) {
            const invId = invItemRes.rows[0].id;
            await client.query(
              `UPDATE inventory 
                     SET quantity = quantity - $1, 
                     last_updated = NOW() 
                     WHERE id = $2`,
              [item.quantity, invId]
            );
            // console.log(
            //   `[InventoryManager] Direct deduction: ${item.quantity} for ${item.item_name}`
            // );
          }
        }
      }
    });

    // console.log(`[InventoryManager] Deduction completed for order ${orderId}`);
  }
}

export const inventoryManager = new InventoryManager();
