import { transaction } from "@/lib/db";
import { getRecipeDeductionQuantity } from "@/lib/inventory-units";

export interface InventoryDeductionItem {
  menu_item_id?: string;
  item_name: string;
  quantity: number;
}

export class InventoryManager {
  async deductIngredientsForOrder(orderId: string, items: InventoryDeductionItem[]): Promise<void> {
    if (items.length === 0) return;

    await transaction(async (client) => {
      for (const item of items) {
        let recipeFound = false;
        let directStockHandled = false;

        if (item.menu_item_id) {
          const mode = (await client.query(
            `SELECT inventory_mode, direct_inventory_id, direct_units_per_sale FROM menu_items WHERE id = $1`,
            [item.menu_item_id]
          )).rows[0];

          if (mode?.inventory_mode === "direct") {
            if (!mode.direct_inventory_id) throw new Error(`Direct inventory is not configured for ${item.item_name}`);
            const deduction = Number(mode.direct_units_per_sale || 1) * item.quantity;
            const updated = await client.query(
              `UPDATE inventory SET quantity = quantity - $1, last_updated = NOW() WHERE id = $2 AND quantity >= $1`,
              [deduction, mode.direct_inventory_id]
            );
            if (updated.rowCount !== 1) throw new Error(`${item.item_name} is out of stock`);
            directStockHandled = true;
          }

          if (!directStockHandled) {
            const ingredients = (await client.query(
              `SELECT r.inventory_item_id, r.quantity, r.unit, i.unit AS inventory_unit,
                      i.recipe_unit, i.conversion_ratio, i.density_g_per_ml, i.name
               FROM recipe_ingredients r
               JOIN inventory i ON i.id = r.inventory_item_id
               WHERE r.menu_item_id = $1`,
              [item.menu_item_id]
            )).rows;

            if (ingredients.length > 0) recipeFound = true;
            for (const ingredient of ingredients) {
              const deduction = getRecipeDeductionQuantity(
                Number(ingredient.quantity) * item.quantity,
                ingredient.unit,
                ingredient.inventory_unit,
                ingredient.conversion_ratio,
                ingredient.density_g_per_ml
              );
              if (deduction === null) throw new Error(`${ingredient.name} uses incompatible units (${ingredient.unit} and ${ingredient.inventory_unit})`);
              const updated = await client.query(
                `UPDATE inventory SET quantity = quantity - $1, last_updated = NOW() WHERE id = $2 AND quantity >= $1`,
                [deduction, ingredient.inventory_item_id]
              );
              if (updated.rowCount !== 1) throw new Error(`${item.item_name} is out of stock: ${ingredient.name}`);
            }
          }
        }

        if (!recipeFound && !directStockHandled) {
          const inventory = (await client.query(`SELECT id, quantity FROM inventory WHERE name = $1 LIMIT 1`, [item.item_name])).rows[0];
          if (inventory) {
            const updated = await client.query(
              `UPDATE inventory SET quantity = quantity - $1, last_updated = NOW() WHERE id = $2 AND quantity >= $1`,
              [item.quantity, inventory.id]
            );
            if (updated.rowCount !== 1) throw new Error(`${item.item_name} is out of stock`);
          }
        }
      }
    });
  }
}

export const inventoryManager = new InventoryManager();
