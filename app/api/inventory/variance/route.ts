import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { query } from "@/lib/db";
import { requirePermission } from "@/lib/api-auth";
import { logAudit } from "@/lib/audit";

const MAX_EVIDENCE_SIZE = 5 * 1024 * 1024;
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function POST(request: NextRequest) {
  const access = await requirePermission("inventory");
  if (access.error) return access.error;

  try {
    const form = await request.formData();
    const inventoryItemId = String(form.get("inventoryItemId") ?? "").trim();
    const reason = String(form.get("reason") ?? "").trim();
    const quantity = Number(form.get("quantity") ?? 0);
    const explanation = String(form.get("explanation") ?? "").trim();
    const evidence = form.get("evidence");

    if (!inventoryItemId || !reason || !explanation || !Number.isFinite(quantity) || quantity <= 0) {
      return NextResponse.json({ error: "Item, reason, quantity, and explanation are required" }, { status: 400 });
    }
    if (!(evidence instanceof File) || !IMAGE_TYPES.has(evidence.type) || evidence.size > MAX_EVIDENCE_SIZE) {
      return NextResponse.json({ error: "One JPEG, PNG, or WebP evidence image under 5MB is required" }, { status: 400 });
    }

    const item = await query("SELECT id, name, sku, quantity, unit FROM inventory WHERE id = $1", [inventoryItemId]);
    if (!item.rows[0]) return NextResponse.json({ error: "Inventory item not found" }, { status: 404 });

    const blob = await put(`inventory-evidence/${inventoryItemId}/${crypto.randomUUID()}.${evidence.type.split("/")[1]}`, evidence, { access: "private", addRandomSuffix: false });
    const reportId = crypto.randomUUID();
    await logAudit({
      action: "SUBMIT_INVENTORY_VARIANCE",
      entityType: "INVENTORY_VARIANCE",
      entityId: reportId,
      performedBy: access.session.id,
      ipAddress: request.headers.get("x-forwarded-for") || "unknown",
      details: {
        status: "submitted",
        inventoryItem: item.rows[0],
        quantity,
        reason,
        explanation,
        evidencePathname: blob.pathname,
        actor: { id: access.session.id, email: access.session.email, role: access.session.role },
        reviewRequired: true,
      },
    });
    return NextResponse.json({ id: reportId, status: "submitted" }, { status: 201 });
  } catch (error) {
    console.error("Inventory variance submission failed:", error);
    return NextResponse.json({ error: "Failed to submit inventory variance" }, { status: 500 });
  }
}
