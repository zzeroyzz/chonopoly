import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { plaidClient } from "@/lib/plaid";
import { syncGoalBalance } from "@/lib/goals/goalsService";
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
    name, icon, target_amount, target_date,
    savings_account,   // { plaid_account_id, plaid_item_id } | undefined
    spending_accounts, // { plaid_account_id, plaid_item_id }[] | undefined
    context_type, context_id,
  } = await request.json();

  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });

  const ctx = await resolveContext(context_type, context_id, user.id);
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data: goal, error } = await db()
    .from("savings_goals")
    .insert({
      owner_type: ctx.type,
      owner_id: ctx.id,
      goal_type: "savings",
      name,
      icon: icon ?? "🎯",
      target_amount: target_amount != null ? Number(target_amount) : null,
      target_date: target_date ?? null,
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Build typed account list: savings first, then spending
  type AccountRef = { plaid_account_id: string; plaid_item_id: string; account_role: "savings" | "spending" };
  const accountList: AccountRef[] = [];

  if (savings_account?.plaid_account_id && savings_account?.plaid_item_id) {
    accountList.push({ ...savings_account, account_role: "savings" });
  }
  for (const a of Array.isArray(spending_accounts) ? spending_accounts : []) {
    if (a?.plaid_account_id && a?.plaid_item_id) {
      accountList.push({ ...a, account_role: "spending" });
    }
  }

  if (accountList.length > 0) {
    // Group by plaid_item_id to minimise Plaid API calls
    const itemMap = new Map<string, AccountRef[]>();
    for (const a of accountList) {
      if (!itemMap.has(a.plaid_item_id)) itemMap.set(a.plaid_item_id, []);
      itemMap.get(a.plaid_item_id)!.push(a);
    }

    const inserts: Record<string, unknown>[] = [];

    for (const [itemId, itemAccounts] of itemMap) {
      const { data: item } = await db()
        .from("plaid_items")
        .select("access_token, institution_name")
        .eq("item_id", itemId)
        .eq("user_id", user.id)
        .maybeSingle();
      if (!item) continue;

      try {
        const res = await plaidClient.accountsGet({ access_token: item.access_token });
        for (const ref of itemAccounts) {
          const found = res.data.accounts.find(a => a.account_id === ref.plaid_account_id);
          if (found) {
            inserts.push({
              goal_id:          goal.id,
              user_id:          user.id,
              plaid_account_id: found.account_id,
              plaid_item_id:    itemId,
              account_name:     found.name,
              institution_name: item.institution_name,
              account_subtype:  found.subtype ?? null,
              cached_balance:   found.balances.current ?? null,
              account_role:     ref.account_role,
            });
          }
        }
      } catch {
        // skip this item on Plaid error; goal is still created
      }
    }

    if (inserts.length > 0) {
      await db().from("goal_accounts").insert(inserts);
      await syncGoalBalance(goal.id);
    }
  }

  return NextResponse.json({ ok: true, goal_id: goal.id });
}
