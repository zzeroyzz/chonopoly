import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { resolveContext } from "@/lib/context";

function db() {
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
  const goalId = searchParams.get("goal_id");
  if (!goalId) return NextResponse.json({ error: "Missing goal_id" }, { status: 400 });

  const ctx = await resolveContext(searchParams.get("context_type"), searchParams.get("context_id"), user.id);
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Verify the goal belongs to this context
  const { data: goal } = await db()
    .from("savings_goals")
    .select("id")
    .eq("id", goalId)
    .eq("owner_id", ctx.id)
    .eq("owner_type", ctx.type)
    .maybeSingle();

  if (!goal) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data: history, error } = await db()
    .from("savings_goal_history")
    .select("balance, recorded_at")
    .eq("goal_id", goalId)
    .order("recorded_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ history: history ?? [] });
}
