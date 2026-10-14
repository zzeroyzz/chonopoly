import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { invalidateBudgetCache } from "@/lib/budget/budgetService";
import { resolveContext } from "@/lib/context";

export async function DELETE(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const ids: string[] = body.budget_ids ?? (body.budget_id ? [body.budget_id] : []);
  if (ids.length === 0) return NextResponse.json({ error: "Missing budget_id or budget_ids" }, { status: 400 });

  const ctx = await resolveContext(body.context_type, body.context_id, user.id);
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // budget_daily_snapshots cascade-deletes via FK when budget is deleted
  const { error } = await supabase
    .from("budgets")
    .delete()
    .in("id", ids)
    .eq("owner_id", ctx.id)
    .eq("owner_type", ctx.type);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  invalidateBudgetCache(ctx);
  return NextResponse.json({ ok: true });
}
