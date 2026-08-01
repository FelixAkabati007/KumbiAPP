import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

// GET all payroll records with staff info
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const userId = searchParams.get("userId");
    const status = searchParams.get("status");

    let sql = `
      SELECT p.*, u.name as staff_name, u.email as staff_email, u.role as staff_role
      FROM payroll p
      JOIN users u ON p.user_id = u.id
      WHERE 1=1
    `;
    const params: string[] = [];

    if (userId) {
      sql += ` AND p.user_id = $${params.length + 1}`;
      params.push(userId);
    }
    if (status) {
      sql += ` AND p.status = $${params.length + 1}`;
      params.push(status);
    }

    sql += ` ORDER BY p.pay_period_start DESC, u.name ASC`;

    const result = await query(sql, params);
    return NextResponse.json(result.rows);
  } catch (error) {
    console.error("Error fetching payroll:", error);
    return NextResponse.json({ error: "Failed to fetch payroll" }, { status: 500 });
  }
}

// POST create payroll record
export async function POST(request: NextRequest) {
  try {
    const {
      user_id,
      pay_period_start,
      pay_period_end,
      basic_salary,
      allowances,
      deductions,
      notes,
    } = await request.json();

    if (!user_id || !pay_period_start || !pay_period_end || basic_salary == null) {
      return NextResponse.json(
        { error: "Staff, pay period and basic salary are required" },
        { status: 400 }
      );
    }

    const result = await query(
      `INSERT INTO payroll (user_id, pay_period_start, pay_period_end, basic_salary, allowances, deductions, notes, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')
       RETURNING *`,
      [
        user_id,
        pay_period_start,
        pay_period_end,
        basic_salary,
        allowances ?? 0,
        deductions ?? 0,
        notes ?? null,
      ]
    );

    return NextResponse.json(result.rows[0], { status: 201 });
  } catch (error) {
    console.error("Error creating payroll:", error);
    return NextResponse.json({ error: "Failed to create payroll record" }, { status: 500 });
  }
}
