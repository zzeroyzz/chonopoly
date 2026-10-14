import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { plaidClient } from "@/lib/plaid";
import { syncGoalBalance } from "@/lib/goals/goalsService";
import { resolveContext } from "@/lib/context";

function serviceDb() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

const STALE_MS = 5 * 60_000;

// ─── GET /api/goals/accounts?goal_id=X ───────────────────────────────────────
// Returns linked accounts grouped by role: { savings, spending[] }.
// Triggers a sync if data is stale (> 5 min).

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const goalId = searchParams.get("goal_id");
  if (!goalId) return NextResponse.json({ error: "goal_id required" }, { status: 400 });

  const db = serviceDb();

  const ctx = await resolveContext(searchParams.get("context_type"), searchParams.get("context_id"), user.id);
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data: goal } = await db
    .from("savings_goals")
    .select("id, last_synced_at")
    .eq("id", goalId)
    .eq("owner_id", ctx.id)
    .eq("owner_type", ctx.type)
    .maybeSingle();

  if (!goal) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const isStale = !goal.last_synced_at ||
    (Date.now() - new Date(goal.last_synced_at).getTime()) > STALE_MS;

  if (isStale) {
    await syncGoalBalance(goalId);
  }

  const { data: accounts, error } = await db
    .from("goal_accounts")
    .select("id, plaid_account_id, plaid_item_id, account_name, institution_name, account_subtype, cached_balance, account_role")
    .eq("goal_id", goalId)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const savings  = accounts?.find(a => a.account_role === "savings") ?? null;
  const spending = accounts?.filter(a => a.account_role === "spending") ?? [];

  return NextResponse.json({ savings, spending });
}

// ─── POST /api/goals/accounts ─────────────────────────────────────────────────
// Links a Plaid account to a goal with a specific role (default: 'spending').
// Caches account metadata at link time. Enforces one-savings-per-goal via DB index.

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { goal_id, plaid_account_id, plaid_item_id, account_role = "spending", context_type, context_id } = await request.json();
  if (!goal_id || !plaid_account_id || !plaid_item_id) {
    return NextResponse.json({ error: "goal_id, plaid_account_id, plaid_item_id required" }, { status: 400 });
  }
  if (account_role !== "savings" && account_role !== "spending") {
    return NextResponse.json({ error: "account_role must be 'savings' or 'spending'" }, { status: 400 });
  }

  const ctx = await resolveContext(context_type, context_id, user.id);
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const db = serviceDb();

  const { data: goal } = await db
    .from("savings_goals")
    .select("id")
    .eq("id", goal_id)
    .eq("owner_id", ctx.id)
    .eq("owner_type", ctx.type)
    .maybeSingle();

  if (!goal) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data: item } = await db
    .from("plaid_items")
    .select("access_token, institution_name")
    .eq("item_id", plaid_item_id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!item) return NextResponse.json({ error: "Plaid item not found" }, { status: 404 });

  let account_name = "";
  let account_subtype: string | null = null;
  let cached_balance: number | null = null;

  try {
    const res = await plaidClient.accountsGet({ access_token: item.access_token });
    const found = res.data.accounts.find(a => a.account_id === plaid_account_id);
    if (found) {
      account_name    = found.name;
      account_subtype = found.subtype ?? null;
      cached_balance  = found.balances.current ?? null;
    }
  } catch {
    // Proceed with empty metadata rather than failing the link
  }

  const { error } = await db
    .from("goal_accounts")
    .insert({
      goal_id,
      user_id:          user.id,
      plaid_account_id,
      plaid_item_id,
      account_name,
      institution_name: item.institution_name,
      account_subtype,
      cached_balance,
      account_role,
    });

  if (error) {
    if (error.code === "23505") {
      const msg = account_role === "savings"
        ? "A savings account is already linked. Remove it first to link a different one."
        : "Account already linked to this goal";
      return NextResponse.json({ error: msg }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await syncGoalBalance(goal_id);

  return NextResponse.json({ ok: true });
}

// ─── DELETE /api/goals/accounts ───────────────────────────────────────────────
// Unlinks an account. Minimum-1 rule applies to spending accounts only —
// savings accounts can always be removed.

export async function DELETE(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { goal_account_id, context_type, context_id } = await request.json();
  if (!goal_account_id) return NextResponse.json({ error: "goal_account_id required" }, { status: 400 });

  const ctx = await resolveContext(context_type, context_id, user.id);
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const db = serviceDb();

  const { data: row } = await db
    .from("goal_accounts")
    .select("id, goal_id, account_role, savings_goals!inner(owner_id, owner_type)")
    .eq("id", goal_account_id)
    .maybeSingle();

  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const goalOwner = (row.savings_goals as unknown as { owner_id: string; owner_type: string });
  if (goalOwner.owner_id !== ctx.id || goalOwner.owner_type !== ctx.type) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Minimum-1 only applies to spending accounts
  if (row.account_role === "spending") {
    const { count } = await db
      .from("goal_accounts")
      .select("id", { count: "exact", head: true })
      .eq("goal_id", row.goal_id)
      .eq("account_role", "spending");

    if ((count ?? 0) <= 1) {
      return NextResponse.json({ error: "Cannot remove the last spending account" }, { status: 400 });
    }
  }

  const { error } = await db
    .from("goal_accounts")
    .delete()
    .eq("id", goal_account_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await syncGoalBalance(row.goal_id);

  return NextResponse.json({ ok: true });
}
