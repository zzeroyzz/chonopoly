import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { syncGoalBalance } from "@/lib/goals/goalsService";
import { resolveContext } from "@/lib/context";

function db() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { goal_id, context_type, context_id } = await request.json();
  if (!goal_id) return NextResponse.json({ error: "Missing goal_id" }, { status: 400 });

  const ctx = await resolveContext(context_type, context_id, user.id);
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Verify ownership before syncing
  const { data: goal } = await db()
    .from("savings_goals")
    .select("id")
    .eq("id", goal_id)
    .eq("owner_id", ctx.id)
    .eq("owner_type", ctx.type)
    .maybeSingle();

  if (!goal) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await syncGoalBalance(goal_id);

  return NextResponse.json({ ok: true });
}
