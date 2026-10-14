// Edge function — sync all active savings goal balances from Plaid
// Schedule: every 12 hours via pg_cron or Supabase Dashboard (cron: "0 */12 * * *")
// Deploy: supabase functions deploy sync-goal-balances
//
// Updated in Step 5 to use goal_accounts instead of the dropped
// plaid_account_id / plaid_item_id columns on savings_goals.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL    = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY     = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PLAID_CLIENT_ID = Deno.env.get("PLAID_CLIENT_ID")!;
const PLAID_SECRET    = Deno.env.get("PLAID_SECRET")!;
const PLAID_ENV       = Deno.env.get("PLAID_ENV") ?? "sandbox";

const PLAID_BASE = ({
  sandbox:     "https://sandbox.plaid.com",
  development: "https://development.plaid.com",
  production:  "https://production.plaid.com",
} as Record<string, string>)[PLAID_ENV] ?? "https://sandbox.plaid.com";

const db = createClient(SUPABASE_URL, SERVICE_KEY);

async function plaidAccountsGet(accessToken: string): Promise<{ accounts: Array<{ account_id: string; balances: { current: number | null } }> }> {
  const res = await fetch(`${PLAID_BASE}/accounts/get`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: PLAID_CLIENT_ID, secret: PLAID_SECRET, access_token: accessToken }),
  });
  return res.json();
}

Deno.serve(async () => {
  // 1. Active savings goals
  const { data: goals, error: goalsErr } = await db
    .from("savings_goals")
    .select("id, owner_id, current_balance, target_amount")
    .eq("status", "active");

  if (goalsErr) {
    console.error("[sync-goal-balances] failed to fetch goals:", goalsErr.message);
    return new Response(JSON.stringify({ error: goalsErr.message }), { status: 500 });
  }
  if (!goals?.length) {
    return new Response(JSON.stringify({ ok: true, success: 0, failed: 0 }));
  }

  const goalIds = goals.map(g => g.id);

  // 2. Linked accounts — two-step query instead of PostgREST join.
  // goal_accounts.plaid_item_id is the Plaid item_id string (text), not the
  // UUID primary key of plaid_items, so PostgREST cannot infer the relationship
  // and plaid_items!inner would fail at schema-cache lookup time.
  const { data: accountRows, error: accountsErr } = await db
    .from("goal_accounts")
    .select("goal_id, plaid_account_id, plaid_item_id")
    .in("goal_id", goalIds);

  if (accountsErr) {
    console.error("[sync-goal-balances] failed to fetch goal_accounts:", accountsErr.message);
    return new Response(JSON.stringify({ error: accountsErr.message }), { status: 500 });
  }

  const uniqueItemIds = [...new Set((accountRows ?? []).map(r => r.plaid_item_id))];
  const { data: plaidItemRows, error: itemsErr } = await db
    .from("plaid_items")
    .select("item_id, access_token")
    .in("item_id", uniqueItemIds);

  if (itemsErr) {
    console.error("[sync-goal-balances] failed to fetch plaid_items:", itemsErr.message);
    return new Response(JSON.stringify({ error: itemsErr.message }), { status: 500 });
  }

  // 3. Fetch Plaid balances once per unique item_id
  const itemAccessMap = new Map<string, string>();
  for (const item of plaidItemRows ?? []) {
    itemAccessMap.set(item.item_id, item.access_token);
  }

  // item_id -> { account_id -> current_balance }
  const itemBalanceMap = new Map<string, Map<string, number>>();
  for (const [itemId, accessToken] of itemAccessMap) {
    try {
      const data = await plaidAccountsGet(accessToken);
      const balances = new Map<string, number>();
      for (const account of data.accounts ?? []) {
        balances.set(account.account_id, account.balances.current ?? 0);
      }
      itemBalanceMap.set(itemId, balances);
    } catch (err) {
      console.error(`[sync-goal-balances] plaid call failed for item ${itemId}:`, err);
    }
  }

  // 4. Sum balances per goal and write updates
  const results = { success: 0, failed: 0 };

  for (const goal of goals) {
    try {
      const linkedAccounts = (accountRows ?? []).filter(r => r.goal_id === goal.id);
      if (!linkedAccounts.length) {
        console.log(`[sync-goal-balances] goal ${goal.id} has no linked accounts, skipping`);
        continue;
      }

      let newBalance = 0;
      for (const linked of linkedAccounts) {
        const balances = itemBalanceMap.get(linked.plaid_item_id);
        if (balances) {
          newBalance += balances.get(linked.plaid_account_id) ?? 0;
        }
      }

      const previousBalance = Number(goal.current_balance ?? 0);
      const isAchieved = goal.target_amount != null && newBalance >= Number(goal.target_amount);

      await db
        .from("savings_goals")
        .update({
          current_balance:  newBalance,
          previous_balance: previousBalance,
          last_synced_at:   new Date().toISOString(),
          ...(isAchieved ? { status: "achieved" } : {}),
        })
        .eq("id", goal.id);

      await db.from("savings_goal_history").insert({ goal_id: goal.id, balance: newBalance });

      console.log(`[sync-goal-balances] goal ${goal.id}: ${previousBalance} -> ${newBalance}`);
      results.success++;
    } catch (err) {
      console.error(`[sync-goal-balances] goal ${goal.id} failed:`, err);
      results.failed++;
    }
  }

  console.log(`[sync-goal-balances] done — ${results.success} succeeded, ${results.failed} failed`);
  return new Response(JSON.stringify(results), { headers: { "Content-Type": "application/json" } });
});
