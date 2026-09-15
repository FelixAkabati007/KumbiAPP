import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission } from "@/lib/api-auth";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await requirePermission("menu");
  if (error) return error;
  const result = await query("SELECT id, step_number, instruction, duration_minutes FROM recipe_steps WHERE menu_item_id = $1 ORDER BY step_number", [id]);
  return NextResponse.json(result.rows);
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await requirePermission("menu");
  if (error) return error;
  const body = await request.json();
  if (!Array.isArray(body.steps)) return NextResponse.json({ error: "steps must be an array" }, { status: 400 });
  await query("DELETE FROM recipe_steps WHERE menu_item_id = $1", [id]);
  for (const [index, step] of body.steps.entries()) {
    if (typeof step.instruction !== "string" || !step.instruction.trim()) continue;
    await query("INSERT INTO recipe_steps (menu_item_id, step_number, instruction, duration_minutes) VALUES ($1, $2, $3, $4)", [id, index + 1, step.instruction.trim(), Number.isFinite(Number(step.duration_minutes)) ? Number(step.duration_minutes) : null]);
  }
  return NextResponse.json({ success: true });
}
