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

  const { data, error } = await db()
    .from("milestones")
    .select("id, milestone_key, earned_at")
    .eq("owner_id", user.id)
    .order("earned_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ milestones: data ?? [] });
}

// Client-side milestone award (e.g. emergency fund — requires live Plaid data)
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json() as Record<string, unknown>;
  const key = body.milestone_key;
  const allowed = ["emergency_fund_1mo", "emergency_fund_3mo"];
  if (typeof key !== "string" || !allowed.includes(key)) {
    return NextResponse.json({ error: "Invalid milestone_key" }, { status: 400 });
  }

  const { error } = await db()
    .from("milestones")
    .insert({ owner_id: user.id, milestone_key: key })
    .select();

  // 23505 = unique violation — milestone already earned, not an error
  if (error && error.code !== "23505") {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
