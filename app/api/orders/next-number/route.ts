
import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function GET() {
  try {
    const today = new Date().toISOString().split('T')[0];
    
    // Count transactions for today to generate sequential number
    // We assume 'transaction_logs' contains completed orders.
    // Ideally, we would have an 'orders' table, but transaction_logs is what we have for now.
    const res = await query(
      `SELECT COUNT(*) as count FROM transaction_logs WHERE DATE(created_at) = CURRENT_DATE`
    );
    
    const count = parseInt(res.rows[0].count as string) + 1;
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
