import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission } from "@/lib/api-auth";
import { getInventoryUnitCompatibilityError, getInventoryUnitSqlExpression, isInventoryBaseUnit, isInventoryUnit, normalizeInventoryUnit } from "@/lib/inventory-units";

const inventoryUnitSql = getInventoryUnitSqlExpression("i.unit");

export async function GET(request: Request) {
  const access = await requirePermission("inventory");
  if (access.error) return access.error;
  const inventoryId = new URL(request.url).searchParams.get("inventoryId");
  const result = await query(
    `SELECT u.*, i.name AS inventory_name FROM inventory_item_uoms u JOIN inventory i ON i.id = u.inventory_id ${inventoryId ? "WHERE u.inventory_id = $1" : ""} ORDER BY u.is_active DESC, u.effective_from DESC`,
    inventoryId ? [inventoryId] : [],
  );
  return NextResponse.json(result.rows);
}

export async function POST(request: Request) {
  const access = await requirePermission("inventory");
  if (access.error) return access.error;
  if (access.session.role !== "admin") return NextResponse.json({ error: "Only administrators can manage conversion rules" }, { status: 403 });
  const body = await request.json();
  const purchaseUnit = normalizeInventoryUnit(String(body.purchaseUnit ?? ""));
  const baseUnit = normalizeInventoryUnit(String(body.baseUnit ?? ""));
  const factor = Number(body.conversionFactorToBase);
  const density = body.densityGPerMl === "" || body.densityGPerMl == null ? null : Number(body.densityGPerMl);
  const yieldFactor = body.yieldFactor == null || body.yieldFactor === "" ? 1 : Number(body.yieldFactor);
  if (!body.inventoryId || !isInventoryUnit(purchaseUnit) || !isInventoryBaseUnit(baseUnit)) return NextResponse.json({ error: "Valid inventory, purchase unit, and base unit are required" }, { status: 400 });
  if (!Number.isFinite(factor) || factor <= 0) return NextResponse.json({ error: "Conversion factor must be greater than zero" }, { status: 400 });
  if (density !== null && (!Number.isFinite(density) || density <= 0)) return NextResponse.json({ error: "Density must be greater than zero" }, { status: 400 });
  if (!Number.isFinite(yieldFactor) || yieldFactor <= 0) return NextResponse.json({ error: "Yield factor must be greater than zero" }, { status: 400 });
  const compatibilityError = getInventoryUnitCompatibilityError(purchaseUnit, baseUnit, density);
  if (compatibilityError) return NextResponse.json({ error: compatibilityError }, { status: 400 });
  const result = await query(
    `INSERT INTO inventory_item_uoms (inventory_id, purchase_unit, base_unit, conversion_factor_to_base, density_g_per_ml, yield_factor) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [body.inventoryId, purchaseUnit, baseUnit, factor, density, yieldFactor],
  );
  return NextResponse.json(result.rows[0], { status: 201 });
}

export async function DELETE(request: Request) {
  const access = await requirePermission("inventory");
  if (access.error) return access.error;
  if (access.session.role !== "admin") return NextResponse.json({ error: "Only administrators can manage conversion rules" }, { status: 403 });
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Rule id is required" }, { status: 400 });
  await query(`UPDATE inventory_item_uoms SET is_active = false, effective_to = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $1`, [id]);
  return NextResponse.json({ success: true });
}
