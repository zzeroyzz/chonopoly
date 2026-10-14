import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { CATEGORY_META } from "@/components/budget/types";
import { invalidateBudgetCache } from "@/lib/budget/budgetService";

function serviceDb() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

const VALID_CATEGORIES = new Set(Object.keys(CATEGORY_META));

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { category } = body as { category: string | null };

  // null clears the override (Plaid's category_primary resumes)
  if (category !== null && !VALID_CATEGORIES.has(category)) {
    return NextResponse.json({ error: "Invalid category" }, { status: 400 });
  }

  const db = serviceDb();
  const { data, error } = await db
    .from("plaid_transactions")
    .update({ category_override: category })
    .eq("plaid_transaction_id", id)
    .eq("user_id", user.id)
    .select("plaid_transaction_id")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });

  invalidateBudgetCache({ type: "personal", id: user.id });

  return NextResponse.json({ ok: true });
}
