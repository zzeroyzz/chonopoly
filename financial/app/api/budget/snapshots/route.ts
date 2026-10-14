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

  // Verify budget belongs to this context
  const { data: budget } = await db
    .from("budgets")
    .select("id")
    .eq("id", budgetId)
    .eq("owner_id", ctx.id)
    .eq("owner_type", ctx.type)
    .maybeSingle();

  if (!budget) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data: snapshots, error } = await db
    .from("budget_daily_snapshots")
    .select("date, daily_rate, amount_spent, remaining_after, days_remaining_after")
    .eq("budget_id", budgetId)
    .order("date", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ snapshots: snapshots ?? [] });
}
