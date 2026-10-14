import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

function db() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data, error } = await db()
      .from("dreams")
      .select("id, icon, title, description, goal_id, sort_order, created_at, goal:savings_goals(id, name, target_amount, current_balance)")
      .eq("owner_id", user.id)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ dreams: data ?? [] });
  } catch (err) {
    console.error("[GET /api/dreams] unexpected error:", err instanceof Error ? err.message : err, err instanceof Error ? err.stack : "");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json() as Record<string, unknown>;
  const { icon, title, description, goal_id } = body;

  if (typeof title !== "string" || !title.trim()) {
    return NextResponse.json({ error: "Title is required" }, { status: 400 });
  }

  const { data, error } = await db()
    .from("dreams")
    .insert({
      owner_id: user.id,
      icon: typeof icon === "string" ? icon : "✨",
      title: title.trim(),
      description: typeof description === "string" ? description.trim() || null : null,
      goal_id: typeof goal_id === "string" && goal_id ? goal_id : null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ dream: data }, { status: 201 });
}
