import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { resolveContext } from "@/lib/context";
import { cycleDueDates } from "@/lib/bills/cycle";

function serviceDb() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const rawType = searchParams.get("context_type");
    const rawId = searchParams.get("context_id");

    const ctx = await resolveContext(rawType, rawId, user.id);
    if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const db = serviceDb();

    const { data: bills, error } = await db
      .from("bills")
      .select(`
        *,
        bill_payments (
          id, paid_at, amount, period, created_at
        )
      `)
      .eq("context_type", ctx.type)
      .eq("context_id", ctx.id)
      .eq("is_active", true)
      .order("due_day", { ascending: true });

    if (error) {
      console.error("[GET /api/bills] Supabase query error:", {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code,
      });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const billsWithDueDate = (bills ?? []).map(bill => {
      // Keep only the 3 most recent payments
      const payments = [...(bill.bill_payments ?? [])]
        .sort((a: { paid_at: string }, b: { paid_at: string }) =>
          new Date(b.paid_at).getTime() - new Date(a.paid_at).getTime()
        )
        .slice(0, 3);

      const nextDueDate = cycleDueDates(bill, new Date()).next;

      return {
        ...bill,
        bill_payments: payments,
        next_due_date: nextDueDate.toISOString().split("T")[0],
      };
    });

    return NextResponse.json({ bills: billsWithDueDate });
  } catch (err) {
    console.error("[GET /api/bills] Uncaught exception:", {
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
      raw: err,
    });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as {
    name: string;
    amount: number;
    due_day: number;
    recurrence: string;
    category_id?: string;
    is_auto_detected?: boolean;
    plaid_merchant?: string;
    context_type?: string;
    context_id?: string;
  };

  const {
    name, amount, due_day, recurrence,
    category_id, is_auto_detected, plaid_merchant,
    context_type, context_id,
  } = body;

  if (!name || !amount || !due_day || !recurrence) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const ctx = await resolveContext(context_type, context_id, user.id);
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const db = serviceDb();
  const { data, error } = await db
    .from("bills")
    .insert({
      owner_id: user.id,
      owner_type: "personal",
      context_type: ctx.type,
      context_id: ctx.id,
      name,
      amount,
      due_day,
      recurrence,
      category_id: category_id ?? null,
      is_auto_detected: is_auto_detected ?? false,
      plaid_merchant: plaid_merchant ?? null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ bill: data });
}

export async function PATCH(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as { bill_id: string; [key: string]: unknown };
  const { bill_id, ...fields } = body;
  if (!bill_id) return NextResponse.json({ error: "Missing bill_id" }, { status: 400 });

  const ctx = await resolveContext(
    fields["context_type"] as string | undefined,
    fields["context_id"] as string | undefined,
    user.id
  );
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Strip fields that must not be updated externally
  const {
    id: _id, owner_id: _oid, created_at: _ca,
    context_type: _ct, context_id: _ci,
    ...safeFields
  } = fields as Record<string, unknown>;
  void _id; void _oid; void _ca; void _ct; void _ci;

  const db = serviceDb();
  const { data, error } = await db
    .from("bills")
    .update(safeFields)
    .eq("id", bill_id)
    .eq("context_type", ctx.type)
    .eq("context_id", ctx.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ bill: data });
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as { bill_id: string; context_type?: string; context_id?: string };
  const { bill_id, context_type, context_id } = body;
  if (!bill_id) return NextResponse.json({ error: "Missing bill_id" }, { status: 400 });

  const ctx = await resolveContext(context_type, context_id, user.id);
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const db = serviceDb();
  const { error } = await db
    .from("bills")
    .update({ is_active: false })
    .eq("id", bill_id)
    .eq("context_type", ctx.type)
    .eq("context_id", ctx.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
