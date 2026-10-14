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
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Auto-upsert row so it always exists after first GET
  const { data: row } = await db()
    .from("user_onboarding")
    .upsert({ user_id: user.id }, { onConflict: "user_id", ignoreDuplicates: true })
    .select()
    .single();

  if (!row) {
    // If upsert didn't return (ignored duplicate), fetch existing
    const { data: existing } = await db()
      .from("user_onboarding")
      .select()
      .eq("user_id", user.id)
      .single();
    return NextResponse.json({ onboarding: existing });
  }

  return NextResponse.json({ onboarding: row });
}

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const allowed = ["connected_bank", "added_savings_goal", "added_debt", "added_asset", "set_up_budget", "dismissed_at"];
  const patch: Record<string, unknown> = {};
  for (const key of allowed) {
    if (body[key] !== undefined) patch[key] = body[key];
  }

  const { error } = await db()
    .from("user_onboarding")
    .upsert({ user_id: user.id, ...patch }, { onConflict: "user_id" });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
