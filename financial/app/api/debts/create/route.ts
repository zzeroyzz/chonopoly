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

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const {
    name, icon, debt_type,
    original_balance, current_balance,
    interest_rate, minimum_payment,
    target_date,
    context_type, context_id,
  } = await request.json();

  if (!name || original_balance == null || current_balance == null || interest_rate == null) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const ctx = await resolveContext(context_type, context_id, user.id);
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Set priority_order to max + 1 so new debts go to the bottom by default
  const { data: maxRow } = await db()
    .from("debts")
    .select("priority_order")
    .eq("owner_type", ctx.type)
    .eq("owner_id", ctx.id)
    .order("priority_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const priority_order = maxRow ? maxRow.priority_order + 1 : 0;

  const { data, error } = await db()
    .from("debts")
    .insert({
      owner_id:         ctx.id,
      owner_type:       ctx.type,
      name,
      icon:             icon             ?? "💳",
      debt_type:        debt_type        ?? "credit_card",
      original_balance: Number(original_balance),
      current_balance:  Number(current_balance),
      interest_rate:    Number(interest_rate),
      minimum_payment:  Number(minimum_payment ?? 0),
      target_date:      target_date      ?? null,
      priority_order,
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ debt_id: data.id });
}
