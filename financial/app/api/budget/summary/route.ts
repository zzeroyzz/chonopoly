import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getBudgetData } from "@/lib/budget/budgetService";
import { resolveContext } from "@/lib/context";

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const period = searchParams.get("period") ?? undefined;
  const goalId = searchParams.get("goal_id") ?? undefined;

  const ctx = await resolveContext(searchParams.get("context_type"), searchParams.get("context_id"), user.id);
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { summaries, totals } = await getBudgetData(user.id, ctx, period, goalId);
  return NextResponse.json({ summaries, totals });
}
