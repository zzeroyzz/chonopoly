import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { sendSavingsNudgeEmail } from "@/lib/budget/notificationService";

function serviceDb() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { budget_name, amount_remaining } = await request.json();

  // nudge_sent persistence is handled by the Step 5 nightly cron via
  // budget_daily_snapshots — no DB write here until then. Client tracks
  // nudge_sent optimistically in local state.

  const db = serviceDb();
  const { data: authUser } = await db.auth.admin.getUserById(user.id);
  const { data: profile } = await db.from("profiles").select("username").eq("id", user.id).single();
  const userRecord = {
    id: user.id,
    email: authUser?.user?.email ?? "",
    username: profile?.username ?? null,
    pay_cycle_start_day: 1,
  };

  sendSavingsNudgeEmail(userRecord, budget_name ?? "Budget", Number(amount_remaining) || 0).catch(console.error);

  return NextResponse.json({ ok: true });
}
