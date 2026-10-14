import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getBudgetTransactions } from "@/lib/budget/budgetService";
import { resolveContext } from "@/lib/context";

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const budgetId   = searchParams.get("budget_id");
  const periodStart = searchParams.get("period_start");
  const periodEnd   = searchParams.get("period_end");

  if (!budgetId || !periodStart || !periodEnd) {
    return NextResponse.json({ error: "budget_id, period_start, period_end required" }, { status: 400 });
  }

  const ctx = await resolveContext(searchParams.get("context_type"), searchParams.get("context_id"), user.id);
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const result = await getBudgetTransactions(user.id, ctx, budgetId, periodStart, periodEnd);
  return NextResponse.json(result);
}
