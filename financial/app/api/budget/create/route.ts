import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { invalidateBudgetCache } from "@/lib/budget/budgetService";
import { resolveContext } from "@/lib/context";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const {
    goal_id,
    name = null,
    category_id,
    total_limit,
    period_type = "monthly",
    period_start,
    period_end,
    recurring = true,
    rollover_enabled = false,
    context_type,
    context_id,
  } = await request.json();

  if (!goal_id)      return NextResponse.json({ error: "goal_id is required" }, { status: 400 });
  if (!category_id)  return NextResponse.json({ error: "category_id is required" }, { status: 400 });
  if (!total_limit)  return NextResponse.json({ error: "total_limit is required" }, { status: 400 });
  if (!period_start) return NextResponse.json({ error: "period_start is required" }, { status: 400 });
  if (!period_end)   return NextResponse.json({ error: "period_end is required" }, { status: 400 });

  const ctx = await resolveContext(context_type, context_id, user.id);
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { error } = await supabase
    .from("budgets")
    .insert({
      goal_id,
      name: name ?? null,
      owner_type: ctx.type,
      owner_id: ctx.id,
      category_id,
      total_limit: Number(total_limit),
      period_type,
      period_start,
      period_end,
      recurring,
      rollover_enabled,
    });

  if (error) {
    console.error("[budget/create]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  invalidateBudgetCache(ctx);
  return NextResponse.json({ ok: true });
}
