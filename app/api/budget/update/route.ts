import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { invalidateBudgetCache } from "@/lib/budget/budgetService";
import { resolveContext } from "@/lib/context";

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { budget_id, name, period_type, total_limit, period_start, period_end, recurring, rollover_enabled, status, goal_id, context_type, context_id } = await request.json();
  if (!budget_id) return NextResponse.json({ error: "Missing budget_id" }, { status: 400 });

  const ctx = await resolveContext(context_type, context_id, user.id);
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const patch: Record<string, unknown> = {};
  if (name             !== undefined) patch.name             = name ?? null;
  if (period_type      !== undefined) patch.period_type      = period_type;
  if (total_limit      !== undefined) patch.total_limit      = Number(total_limit);
  if (period_start     !== undefined) patch.period_start     = period_start;
  if (period_end       !== undefined) patch.period_end       = period_end;
  if (recurring        !== undefined) patch.recurring        = recurring;
  if (rollover_enabled !== undefined) patch.rollover_enabled = rollover_enabled;
  if (status           !== undefined) patch.status           = status;
  if (goal_id          !== undefined && goal_id !== null) patch.goal_id = goal_id;

  const { error } = await supabase
    .from("budgets")
    .update(patch)
    .eq("id", budget_id)
    .eq("owner_id", ctx.id)
    .eq("owner_type", ctx.type);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  invalidateBudgetCache(ctx);
  return NextResponse.json({ ok: true });
}
