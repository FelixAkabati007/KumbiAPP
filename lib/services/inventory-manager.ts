import { transaction, type DatabaseClient } from "@/lib/db";
import { getInventoryUnitSqlExpression, getRecipeDeductionQuantity } from "@/lib/inventory-units";

const inventoryUnitSql = `COALESCE(${getInventoryUnitSqlExpression("i.container_unit")}, ${getInventoryUnitSqlExpression("i.unit")})`;

export interface InventoryDeductionItem {
  menu_item_id?: string;
  item_name: string;
  quantity: number;
}

export class InventoryManager {
  async deductIngredientsForOrder(
    orderId: string,
    items: InventoryDeductionItem[],
    externalClient?: DatabaseClient,
    actorId?: string
  ): Promise<void> {
    if (items.length === 0) return;

    const execute = async (client: DatabaseClient) => {
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
              `UPDATE inventory SET quantity = quantity - $1, last_updated = NOW() WHERE id = $2 AND quantity >= $1 RETURNING quantity`,
              [deduction, mode.direct_inventory_id]
            );
            if (updated.rowCount !== 1) throw new Error(`${item.item_name} is out of stock`);

            await client.query(
              `INSERT INTO inventory_movements (inventory_id, menu_item_id, quantity_delta, movement_type, source_type, source_id, order_id, reason, actor_id)
               VALUES ($1, $2, $3, 'sale', 'pos_order', $4, $5, $6, $7)`,
              [mode.direct_inventory_id, item.menu_item_id, -deduction, orderId, orderId, `Direct sale deduction for ${item.item_name}`, actorId || null]
            ).catch(() => null);

            directStockHandled = true;
          }

          if (!directStockHandled) {
            const ingredients = (await client.query(
              `SELECT r.inventory_item_id, r.quantity, r.unit,
                      i.unit AS stock_unit,
                      COALESCE(active_uom.base_unit, i.base_unit, i.unit) AS base_unit,
                      i.recipe_unit,
                      COALESCE(active_uom.conversion_factor_to_base * active_uom.yield_factor, i.chef_yield_per_stock_unit, i.conversion_ratio) AS conversion_ratio,
                      i.density_g_per_ml, i.name
               FROM recipe_ingredients r
               JOIN inventory i ON i.id = r.inventory_item_id
               LEFT JOIN LATERAL (
                 SELECT u.base_unit, u.conversion_factor_to_base, u.yield_factor
                 FROM inventory_item_uoms u
                 WHERE u.inventory_id = i.id AND u.purchase_unit = ${inventoryUnitSql}
                   AND u.is_active = true AND (u.effective_to IS NULL OR u.effective_to > CURRENT_TIMESTAMP)
                 ORDER BY u.effective_from DESC LIMIT 1
               ) active_uom ON true
               WHERE r.menu_item_id = $1`,
              [item.menu_item_id]
            )).rows;

            if (ingredients.length > 0) recipeFound = true;
            for (const ingredient of ingredients) {
              const deduction = getRecipeDeductionQuantity(
                Number(ingredient.quantity) * item.quantity,
                ingredient.unit,
                ingredient.stock_unit,
                ingredient.conversion_ratio,
                ingredient.density_g_per_ml
              );
              if (deduction === null) throw new Error(`${ingredient.name} uses incompatible units (${ingredient.unit} and ${ingredient.stock_unit})`);
              const updated = await client.query(
                `UPDATE inventory SET quantity = quantity - $1, last_updated = NOW() WHERE id = $2 AND quantity >= $1 RETURNING quantity`,
                [deduction, ingredient.inventory_item_id]
              );
              if (updated.rowCount !== 1) throw new Error(`${item.item_name} is out of stock: ${ingredient.name}`);

              await client.query(
                `INSERT INTO inventory_movements (inventory_id, menu_item_id, quantity_delta, movement_type, source_type, source_id, order_id, reason, actor_id)
                 VALUES ($1, $2, $3, 'sale', 'pos_order', $4, $5, $6, $7)`,
                [ingredient.inventory_item_id, item.menu_item_id, -deduction, orderId, orderId, `Recipe deduction for ${item.item_name}`, actorId || null]
              ).catch(() => null);
            }
          }
        }

        if (!recipeFound && !directStockHandled) {
          const inventory = (await client.query(`SELECT id, quantity, unit FROM inventory WHERE name = $1 LIMIT 1`, [item.item_name])).rows[0];
          if (inventory) {
            const updated = await client.query(
              `UPDATE inventory SET quantity = quantity - $1, last_updated = NOW() WHERE id = $2 AND quantity >= $1 RETURNING quantity`,
              [item.quantity, inventory.id]
            );
            if (updated.rowCount !== 1) throw new Error(`${item.item_name} is out of stock`);

            await client.query(
              `INSERT INTO inventory_movements (inventory_id, menu_item_id, quantity_delta, movement_type, source_type, source_id, order_id, reason, actor_id)
               VALUES ($1, $2, $3, 'sale', 'pos_order', $4, $5, $6, $7)`,
              [inventory.id, item.menu_item_id || null, -item.quantity, orderId, orderId, `Sale deduction for ${item.item_name}`, actorId || null]
            ).catch(() => null);
          }
        }
      }
    };

    if (externalClient) {
      await execute(externalClient);
    } else {
      await transaction(execute);
    }
  }
}

export const inventoryManager = new InventoryManager();
