
import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission } from "@/lib/api-auth";

export async function GET() {
  try {
    const { error } = await requirePermission("pos");
    if (error) return error;

    const today = new Date().toISOString().split('T')[0];
    
    // Count orders from kitchenorders for today to generate sequential number
    const res = await query(
      `SELECT COUNT(*) as count FROM kitchenorders WHERE DATE(createdat) = CURRENT_DATE`
    );
    
    const count = parseInt((res.rows[0]?.count as string) || "0") + 1;
    const dateStr = today.replace(/-/g, "");
    
    // Format: ORD-YYYYMMDD-XXXX
    const orderNumber = `ORD-${dateStr}-${count.toString().padStart(4, "0")}`;
    
    return NextResponse.json({ orderNumber });
  } catch (error) {
    console.error("Failed to generate order number:", error);
    // Fallback
    const fallback = `ORD-${Date.now()}`;
    return NextResponse.json({ orderNumber: fallback });
  }
}
