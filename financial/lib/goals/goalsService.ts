import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { plaidClient } from "../plaid";
import { getPlaidItems } from "../supabase/plaid";
import { GoalSummary } from "./types";
import { RequestContext } from "../context";
import { sendBalanceDropEmail, sendGoalAchievedEmail } from "./notificationService";

function db(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// ─── syncGoalBalance ──────────────────────────────────────────────────────────
// Fetches live balances from Plaid for all accounts in goal_accounts for this
// goal, sums them, and writes to savings_goals + savings_goal_history.

export async function syncGoalBalance(goalId: string): Promise<void> {
  const { data: goal } = await db()
    .from("savings_goals")
    .select("id, owner_id, name, current_balance, target_amount, status, notified_drop")
    .eq("id", goalId)
    .single();

  if (!goal || goal.status === "paused") return;

  // Only savings accounts contribute to goal balance
  const { data: linkedAccounts } = await db()
    .from("goal_accounts")
    .select("plaid_account_id, plaid_item_id, user_id")
    .eq("goal_id", goalId)
    .eq("account_role", "savings");

  if (!linkedAccounts?.length) return;

  // Group account IDs by plaid_item_id to minimise Plaid API calls
  const itemAccounts = new Map<string, { userId: string; accountIds: string[] }>();
  for (const la of linkedAccounts) {
    if (!itemAccounts.has(la.plaid_item_id)) {
      itemAccounts.set(la.plaid_item_id, { userId: la.user_id, accountIds: [] });
    }
    itemAccounts.get(la.plaid_item_id)!.accountIds.push(la.plaid_account_id);
  }

  let newBalance = 0;
  const accountBalances = new Map<string, number>();

  for (const [itemId, { userId, accountIds }] of itemAccounts) {
    const { data: items } = await getPlaidItems(userId);
    const item = items.find(i => i.item_id === itemId);
    if (!item) continue;
    try {
      const res = await plaidClient.accountsGet({ access_token: item.access_token });
      for (const account of res.data.accounts) {
        if (accountIds.includes(account.account_id)) {
          const bal = account.balances.current ?? 0;
          newBalance += bal;
          accountBalances.set(account.account_id, bal);
        }
      }
    } catch {
      // one bank failing shouldn't block the rest
    }
  }

  // Write per-account cached_balance so GET /api/goals/accounts reads local data
  for (const [accountId, balance] of accountBalances) {
    await db()
      .from("goal_accounts")
      .update({ cached_balance: balance })
      .eq("goal_id", goalId)
      .eq("plaid_account_id", accountId);
  }

  const previousBalance = Number(goal.current_balance);

  await db()
    .from("savings_goals")
    .update({ current_balance: newBalance, previous_balance: previousBalance, last_synced_at: new Date().toISOString() })
    .eq("id", goalId);

  await db()
    .from("savings_goal_history")
    .insert({ goal_id: goalId, balance: newBalance });

  const { data: authUser } = await db().auth.admin.getUserById(goal.owner_id);
  const { data: profile } = await db().from("profiles").select("username").eq("id", goal.owner_id).single();
  const user = { id: goal.owner_id, email: authUser?.user?.email ?? "", username: profile?.username ?? null };

  if (newBalance < previousBalance) {
    sendBalanceDropEmail(user, goal, previousBalance - newBalance);
  }

  const targetAmount = goal.target_amount != null ? Number(goal.target_amount) : null;
  if (targetAmount != null && newBalance >= targetAmount && goal.status === "active") {
    await db().from("savings_goals").update({ status: "achieved" }).eq("id", goalId);
    sendGoalAchievedEmail(user, goal);
  }
}

// ─── getGoalSummary ───────────────────────────────────────────────────────────

export async function getGoalSummary(userId: string, ctx: RequestContext): Promise<GoalSummary[]> {
  const { data: goals } = await db()
    .from("savings_goals")
    .select("id, name, icon, goal_type, target_amount, target_date, created_at, current_balance, last_synced_at, status")
    .eq("owner_type", ctx.type)
    .eq("owner_id", ctx.id)
    .order("created_at", { ascending: true });

  if (!goals?.length) return [];

  const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000).toISOString();

  const summaries: GoalSummary[] = [];

  for (const goal of goals) {
    const targetAmount = goal.target_amount != null ? Number(goal.target_amount) : null;
    const currentBalance = Number(goal.current_balance);

    const { data: history } = await db()
      .from("savings_goal_history")
      .select("balance, recorded_at")
      .eq("goal_id", goal.id)
      .gte("recorded_at", thirtyDaysAgo)
      .order("recorded_at", { ascending: true });

    const percentComplete = (targetAmount != null && targetAmount > 0)
      ? Math.min(100, Math.round((currentBalance / targetAmount) * 1000) / 10)
      : 0;

    let projected_completion_date: string | null = null;
    let on_track = false;
    let weekly_avg_growth = 0;

    if (history && history.length >= 2) {
      const earliest = history[0];
      const latest = history[history.length - 1];
      const daysBetween = (new Date(latest.recorded_at).getTime() - new Date(earliest.recorded_at).getTime()) / 86_400_000;

      if (daysBetween >= 1) {
        const dailyGrowth = (Number(latest.balance) - Number(earliest.balance)) / daysBetween;
        weekly_avg_growth = Math.round(dailyGrowth * 7 * 100) / 100;

        if (dailyGrowth > 0 && targetAmount != null) {
          const remaining = targetAmount - currentBalance;
          const daysToGoal = remaining / dailyGrowth;
          const projectedDate = new Date(Date.now() + daysToGoal * 86_400_000);
          projected_completion_date = projectedDate.toISOString().split("T")[0];
          on_track = goal.target_date != null && projected_completion_date <= goal.target_date;
        }
      }
    }

    let expected_balance = 0;
    let behind_by = 0;

    if (targetAmount != null && goal.target_date && goal.created_at) {
      const createdMs = new Date(goal.created_at).getTime();
      const targetMs  = new Date(goal.target_date + "T00:00:00").getTime();
      const nowMs     = Date.now();
      const totalDays   = Math.max(1, (targetMs - createdMs) / 86_400_000);
      const elapsedDays = Math.max(0, Math.min(totalDays, (nowMs - createdMs) / 86_400_000));
      expected_balance = Math.round((elapsedDays / totalDays) * targetAmount * 100) / 100;
      behind_by = Math.max(0, Math.round((expected_balance - currentBalance) * 100) / 100);
    }

    // Auto-correct stale "achieved" status when balance no longer meets the target
    // (e.g. user raised the target after the goal was marked achieved)
    let resolvedStatus = goal.status as GoalSummary["status"];
    if (resolvedStatus === "achieved" && targetAmount != null && currentBalance < targetAmount) {
      resolvedStatus = "active";
      await db().from("savings_goals").update({ status: "active" }).eq("id", goal.id);
    }

    summaries.push({
      id: goal.id,
      name: goal.name,
      icon: goal.icon,
      goal_type: goal.goal_type ?? "savings",
      target_amount: targetAmount,
      target_date: goal.target_date ?? null,
      created_at: goal.created_at,
      current_balance: currentBalance,
      percent_complete: percentComplete,
      projected_completion_date,
      on_track,
      weekly_avg_growth,
      expected_balance,
      behind_by,
      status: resolvedStatus,
      last_synced_at: goal.last_synced_at,
    });
  }

  return summaries;
}
