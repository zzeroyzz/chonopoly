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

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { goal_id, name, icon, target_amount, target_date, status, context_type, context_id } = await request.json();
  if (!goal_id) return NextResponse.json({ error: "Missing goal_id" }, { status: 400 });

  const ctx = await resolveContext(context_type, context_id, user.id);
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data: goal } = await db()
    .from("savings_goals")
    .select("id, current_balance, status")
    .eq("id", goal_id)
    .eq("owner_id", ctx.id)
    .eq("owner_type", ctx.type)
    .maybeSingle();

  if (!goal) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const patch: Record<string, unknown> = {};
  if (name !== undefined)          patch.name          = name;
  if (icon !== undefined)          patch.icon          = icon;
  if (target_amount !== undefined) patch.target_amount = Number(target_amount);
  if (target_date !== undefined)   patch.target_date   = target_date;
  if (status !== undefined)        patch.status        = status;

  // Recalculate status when target_amount changes and status wasn't explicitly set.
  // Prevents a goal staying "achieved" after its target is raised past the current balance.
  if (target_amount !== undefined && status === undefined) {
    const newTarget = Number(target_amount);
    const balance = Number(goal.current_balance);
    if (newTarget > balance && goal.status === "achieved") {
      patch.status = "active";
    } else if (newTarget <= balance && goal.status === "active") {
      patch.status = "achieved";
    }
  }

  const { error } = await db()
    .from("savings_goals")
    .update(patch)
    .eq("id", goal_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
