import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth";
import { transaction } from "@/lib/db";
import { updateSystemState } from "@/lib/system-sync";
import { parsePositiveQuantity } from "@/lib/inventory-top-up-validation";
import { canTopUpInventory } from "@/lib/roles";

const priceRoles = new Set(["admin", "manager", "restaurantManager", "kitchen", "frontDesk"]);

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await requirePermission("inventory");
  if (access.error) return access.error;
  try {
    const { id } = await params;
    const url = new URL(req.url);
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 50), 1), 200);
    const result = await transaction((client) => client.query(
      `SELECT e.id, e.inventory_id AS inventory_item_id, e.quantity_before,
              e.quantity_delta AS quantity_added, e.quantity_after, e.staff_id AS performed_by,
              e.created_at AS performed_at, e.event_type AS source, e.reason,
              e.purchase_packaging_price_before, e.purchase_packaging_price_after,
              e.staff_name AS performed_by_name, e.staff_role AS performed_by_role,
              e.correlation_id, e.idempotency_key
       FROM inventory_events e
       WHERE e.inventory_id = $1 ORDER BY e.created_at DESC LIMIT $2`, [id, limit]
    ));
    return NextResponse.json(result.rows);
  } catch (error) {
    console.error("Top-up history failed:", error);
    return NextResponse.json({ error: "Failed to fetch top-up history" }, { status: 500 });
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await requirePermission("inventory");
  if (access.error) return access.error;
  const session = access.session;
  if (!canTopUpInventory(session.role)) {
    return NextResponse.json({ error: "Forbidden: stock top-up access is restricted" }, { status: 403 });
  }
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const quantityAdded = parsePositiveQuantity(body.quantityAdded);
    if (quantityAdded === null) return NextResponse.json({ error: "Top-up quantity must be a positive number", code: "INVALID_QUANTITY" }, { status: 400 });
    const requestedPrice = body.purchasePackagingPrice ?? body.costPerContainer;
    const hasPriceChange = requestedPrice !== undefined && requestedPrice !== null && String(requestedPrice).trim() !== "";
    const purchasePackagingPrice = hasPriceChange ? Number(requestedPrice) : null;
    if (hasPriceChange && (!priceRoles.has(session.role) || purchasePackagingPrice === null || !Number.isFinite(purchasePackagingPrice) || purchasePackagingPrice < 0)) {
      return NextResponse.json({ error: "Only authorized staff may set a valid Purchase Packaging price", code: "INVALID_PACKAGING_PRICE" }, { status: 403 });
    }
    const reason = body.reason ? String(body.reason).trim().slice(0, 500) : null;
    if (hasPriceChange && !reason) return NextResponse.json({ error: "Explain the local market price change before saving it", code: "PRICE_CHANGE_REASON_REQUIRED" }, { status: 400 });
    const idempotencyKey = String(body.idempotencyKey || req.headers.get("Idempotency-Key") || crypto.randomUUID()).trim();
    if (!idempotencyKey || idempotencyKey.length > 120) return NextResponse.json({ error: "Invalid idempotency key", code: "INVALID_IDEMPOTENCY_KEY" }, { status: 400 });

    const result = await transaction(async (client) => {
      const existing = await client.query(`SELECT id, inventory_item_id, quantity_before, quantity_added, quantity_after, performed_by, performed_at, source, request_metadata FROM inventory_top_up_audit WHERE idempotency_key = $1`, [idempotencyKey]);
      if (existing.rowCount) return { audit: existing.rows[0], duplicate: true };
      const item = await client.query(`SELECT id, quantity, name, unit, category, cost_per_container, quantity_per_container, cost_per_item FROM inventory WHERE id = $1 FOR UPDATE`, [id]);
      if (!item.rowCount) throw Object.assign(new Error("Inventory item not found"), { code: "NOT_FOUND" });
      const before = Number(item.rows[0].quantity ?? 0);
      const priceBefore = Number(item.rows[0].cost_per_container ?? 0);
      const priceAfter = hasPriceChange ? purchasePackagingPrice! : priceBefore;
      const quantityPerContainer = Number(item.rows[0].quantity_per_container ?? 0);
      const costPerItem = quantityPerContainer > 0 ? priceAfter / quantityPerContainer : Number(item.rows[0].cost_per_item ?? 0);
      const updated = await client.query(`UPDATE inventory SET quantity = quantity + $1, cost_per_container = $2, cost_per_item = $3, last_updated = NOW() WHERE id = $4 RETURNING id, name, quantity, unit, cost_per_container, cost_per_item`, [quantityAdded, priceAfter, costPerItem, id]);
      const after = Number(updated.rows[0].quantity);
      const metadata = { eventType: hasPriceChange ? "RESTOCK_AND_PRICE_CHANGE" : "RESTOCK", reason, staffName: session.name || session.email, staffRole: session.role, priceField: "Purchase Packaging", purchasePackagingPriceBefore: priceBefore, purchasePackagingPriceAfter: priceAfter };
      const audit = await client.query(`INSERT INTO inventory_top_up_audit (inventory_item_id, quantity_before, quantity_added, quantity_after, performed_by, idempotency_key, source, request_metadata) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id, inventory_item_id, quantity_before, quantity_added, quantity_after, performed_by, performed_at, source, request_metadata`, [id, before, quantityAdded, after, session.id, idempotencyKey, hasPriceChange ? "manual_top_up_price_change" : "manual_top_up", JSON.stringify(metadata)]);
      await client.query(`INSERT INTO inventory_events (inventory_id, event_type, quantity_before, quantity_delta, quantity_after, purchase_packaging_price_before, purchase_packaging_price_after, cost_per_item_before, cost_per_item_after, reason, staff_id, staff_name, staff_role, correlation_id, idempotency_key, metadata) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`, [id, hasPriceChange ? "RESTOCK_AND_PRICE_CHANGE" : "RESTOCK", before, quantityAdded, after, priceBefore, priceAfter, Number(item.rows[0].cost_per_item ?? 0), costPerItem, reason, session.id, session.name || session.email || session.id, session.role, idempotencyKey, idempotencyKey, JSON.stringify(metadata)]);
      return { item: updated.rows[0], audit: audit.rows[0], duplicate: false };
    });
    if (!result.duplicate) {
      await updateSystemState("inventory");
    }
    return NextResponse.json(result, { status: result.duplicate ? 200 : 201 });
  } catch (error) {
    const typed = error as { code?: string };
    if (typed.code === "NOT_FOUND") return NextResponse.json({ error: "Inventory item not found", code: "INVENTORY_ITEM_NOT_FOUND" }, { status: 404 });
    if (typed.code === "23505") return NextResponse.json({ error: "This top-up was already submitted", code: "DUPLICATE_TOP_UP" }, { status: 409 });
    console.error("Inventory top-up failed:", error);
    return NextResponse.json({ error: "Failed to top up inventory" }, { status: 500 });
  }
}
