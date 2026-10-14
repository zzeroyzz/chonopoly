import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { resolveContext } from "@/lib/context";

function serviceDb() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const budgetId = searchParams.get("budget_id");
  if (!budgetId) return NextResponse.json({ error: "budget_id required" }, { status: 400 });

  const ctx = await resolveContext(searchParams.get("context_type"), searchParams.get("context_id"), user.id);
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const db = serviceDb();

  // Look up active budget to get goal_id, category_id, period_type
  const { data: ref } = await db
    .from("budgets")
    .select("goal_id, category_id, period_type")
    .eq("id", budgetId)
    .eq("owner_id", ctx.id)
    .eq("owner_type", ctx.type)
    .maybeSingle();

  if (!ref) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // All paused rows for the same goal + category + period_type under this owner
  const { data: rows, error } = await db
    .from("budgets")
    .select("id, period_start, period_end, total_limit")
    .eq("goal_id", ref.goal_id)
    .eq("category_id", ref.category_id)
    .eq("period_type", ref.period_type)
    .eq("owner_id", ctx.id)
    .eq("owner_type", ctx.type)
    .eq("status", "paused")
    .order("period_start", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ rows: rows ?? [] });
}
