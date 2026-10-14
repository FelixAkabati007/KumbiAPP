import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth";
import { transaction } from "@/lib/db";
import { getCanonicalTransactionTimestamp } from "@/lib/property-time";
import { updateSystemState } from "@/lib/system-sync";
import { getInventoryUnitSqlExpression } from "@/lib/inventory-units";

const inventoryUnitSql = getInventoryUnitSqlExpression("i.unit");

export async function GET() {
  const access = await requirePermission("inventory");
  if (access.error) return access.error;
  try {
    const result = await transaction((client) => client.query(`
      SELECT i.id, COALESCE(mi.name, i.name) AS name, i.quantity, i.unit, i.base_unit,
        u.purchase_unit, u.base_unit AS rule_base_unit, u.conversion_factor_to_base,
        u.yield_factor, u.id AS rule_id
      FROM inventory i
      LEFT JOIN menu_items mi ON mi.id = i.menu_item_id
      LEFT JOIN LATERAL (
        SELECT * FROM inventory_item_uoms r
        WHERE r.inventory_id = i.id AND r.purchase_unit = ${inventoryUnitSql}
          AND r.is_active = true AND (r.effective_to IS NULL OR r.effective_to > CURRENT_TIMESTAMP)
        ORDER BY r.effective_from DESC LIMIT 1
      ) u ON true
      ORDER BY COALESCE(mi.name, i.name)`));
    const items = result.rows.map((row) => {
      const currentUnit = String(row.unit ?? "").toLowerCase();
      const baseUnit = String(row.base_unit ?? "").toLowerCase();
      const alreadyBase = Boolean(baseUnit && currentUnit === baseUnit);
      const hasRule = Boolean(row.rule_id);
      return {
        id: row.id, name: row.name, quantity: Number(row.quantity ?? 0), unit: row.unit,
        baseUnit: row.base_unit, status: alreadyBase || hasRule ? "ready" : "missing_rule",
        rule: hasRule ? { id: row.rule_id, purchaseUnit: row.purchase_unit, baseUnit: row.rule_base_unit, factor: Number(row.conversion_factor_to_base), yieldFactor: Number(row.yield_factor) } : null,
        convertedQuantity: hasRule ? Number(row.quantity ?? 0) * Number(row.conversion_factor_to_base) * Number(row.yield_factor) : Number(row.quantity ?? 0),
      };
    });
    return NextResponse.json({ items, ready: items.filter((item) => item.status === "ready").length, missingRules: items.filter((item) => item.status === "missing_rule").length, migrated: false });
  } catch (error) {
    console.error("Inventory conversion preview failed:", error);
    return NextResponse.json({ error: "Failed to load conversion preview" }, { status: 500 });
  }
}

export async function POST() {
  const access = await requirePermission("inventory");
  if (access.error) return access.error;
  const session = access.session;
  try {
    const canonicalNow = await getCanonicalTransactionTimestamp();
    const result = await transaction(async (client) => {
      const rows = await client.query(`
        SELECT i.id, i.quantity, i.unit, i.base_unit, u.base_unit AS rule_base_unit,
          u.conversion_factor_to_base, u.yield_factor
        FROM inventory i
        LEFT JOIN LATERAL (
          SELECT * FROM inventory_item_uoms r
          WHERE r.inventory_id = i.id AND r.purchase_unit = ${inventoryUnitSql}
            AND r.is_active = true AND (r.effective_to IS NULL OR r.effective_to > CURRENT_TIMESTAMP)
          ORDER BY r.effective_from DESC LIMIT 1
        ) u ON true
        FOR UPDATE`);
      let migrated = 0;
      let skipped = 0;
      for (const row of rows.rows) {
        const currentUnit = String(row.unit ?? "").toLowerCase();
        const baseUnit = String(row.base_unit ?? "").toLowerCase();
        if (row.rule_base_unit && row.conversion_factor_to_base && currentUnit !== String(row.rule_base_unit).toLowerCase()) {
          const before = Number(row.quantity ?? 0);
          const after = before * Number(row.conversion_factor_to_base) * Number(row.yield_factor ?? 1);
          await client.query(`UPDATE inventory SET quantity = $1, unit = $2, base_unit = $2, last_updated = $3 WHERE id = $4`, [after, row.rule_base_unit, canonicalNow, row.id]);
          await client.query(`INSERT INTO inventory_events (inventory_id, event_type, quantity_before, quantity_delta, quantity_after, reason, staff_id, staff_name, staff_role, metadata, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::timestamptz)`, [row.id, "UNIT_CONVERSION_MIGRATION", before, after - before, after, "Migrated current stock to canonical base unit", session.id, session.name || session.email || session.id, session.role, JSON.stringify({ conversionFactor: row.conversion_factor_to_base, yieldFactor: row.yield_factor, fromUnit: row.unit, toUnit: row.rule_base_unit }), canonicalNow]);
          migrated++;
        } else if (!baseUnit || currentUnit !== baseUnit) skipped++;
      }
      return { migrated, skipped };
    });
    if (result.migrated) await updateSystemState("inventory");
    return NextResponse.json({ ...result, migratedAt: canonicalNow });
  } catch (error) {
    console.error("Inventory conversion migration failed:", error);
    return NextResponse.json({ error: "Failed to migrate current inventory stock" }, { status: 500 });
  }
}
