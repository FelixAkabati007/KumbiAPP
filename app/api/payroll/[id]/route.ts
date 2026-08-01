import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

// PATCH update payroll record (status, figures, notes)
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const { basic_salary, allowances, deductions, notes, status } = await request.json();

    const fields: string[] = [];
    const params: (string | number | null)[] = [];

    if (basic_salary != null) { fields.push(`basic_salary=$${params.length + 1}`); params.push(basic_salary); }
    if (allowances != null)   { fields.push(`allowances=$${params.length + 1}`);   params.push(allowances); }
    if (deductions != null)   { fields.push(`deductions=$${params.length + 1}`);   params.push(deductions); }
    if (notes != null)        { fields.push(`notes=$${params.length + 1}`);        params.push(notes); }
    if (status != null) {
      fields.push(`status=$${params.length + 1}`);
      params.push(status);
      if (status === "paid") {
        fields.push(`paid_at=NOW()`);
      }
    }

    if (fields.length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    fields.push(`updated_at=NOW()`);
    params.push(id);

    const result = await query(
      `UPDATE payroll SET ${fields.join(", ")} WHERE id=$${params.length} RETURNING *`,
      params
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: "Record not found" }, { status: 404 });
    }

    return NextResponse.json(result.rows[0]);
  } catch (error) {
    console.error("Error updating payroll:", error);
    return NextResponse.json({ error: "Failed to update payroll record" }, { status: 500 });
  }
}

// DELETE payroll record
export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const result = await query("DELETE FROM payroll WHERE id=$1 RETURNING id", [id]);
    if (result.rows.length === 0) {
      return NextResponse.json({ error: "Record not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting payroll:", error);
    return NextResponse.json({ error: "Failed to delete payroll record" }, { status: 500 });
  }
}
