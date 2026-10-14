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

  const {
    debt_id,
    name, icon, debt_type,
    original_balance, current_balance,
    interest_rate, minimum_payment,
    priority_order, target_date, status,
    context_type, context_id,
  } = await request.json();

  if (!debt_id) return NextResponse.json({ error: "Missing debt_id" }, { status: 400 });

  const ctx = await resolveContext(context_type, context_id, user.id);
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const patch: Record<string, unknown> = {};
  if (name             !== undefined) patch.name             = name;
  if (icon             !== undefined) patch.icon             = icon;
  if (debt_type        !== undefined) patch.debt_type        = debt_type;
  if (original_balance !== undefined) patch.original_balance = Number(original_balance);
  if (current_balance  !== undefined) patch.current_balance  = Number(current_balance);
  if (interest_rate    !== undefined) patch.interest_rate    = Number(interest_rate);
  if (minimum_payment  !== undefined) patch.minimum_payment  = Number(minimum_payment);
  if (priority_order   !== undefined) patch.priority_order   = Number(priority_order);
  if (target_date      !== undefined) patch.target_date      = target_date;
  if (status           !== undefined) patch.status           = status;

  // Auto-mark as paid_off when current balance reaches zero
  if (current_balance !== undefined && Number(current_balance) <= 0 && status === undefined) {
    patch.status = "paid_off";
  }

  const { error } = await db()
    .from("debts")
    .update(patch)
    .eq("id", debt_id)
    .eq("owner_id", ctx.id)
    .eq("owner_type", ctx.type);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
