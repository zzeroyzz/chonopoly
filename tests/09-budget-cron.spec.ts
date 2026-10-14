// Tests for Step 5 nightly cron Edge Functions.
// These tests call the functions directly via HTTP and assert on the
// database state they produce — the same way pg_cron will invoke them.

import { test, expect, request } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL   = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SERVICE_KEY    = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
const FN_BASE        = SUPABASE_URL ? `${SUPABASE_URL}/functions/v1` : "";

// Service role client for seeding and asserting — placeholder values prevent
// module-level crash when SUPABASE_SERVICE_ROLE_KEY is absent (CI without secret)
const db = createClient(SUPABASE_URL || "https://placeholder.supabase.co", SERVICE_KEY || "placeholder");

function today() {
  return new Date().toISOString().split("T")[0];
}

async function cleanupTestData(goalId: string, userId: string) {
  // Delete in FK order — budgets cascade to budget_daily_snapshots
  await db.from("budgets").delete().eq("goal_id", goalId);
  await db.from("goal_accounts").delete().eq("goal_id", goalId);
  await db.from("savings_goals").delete().eq("id", goalId);
  await db.from("plaid_transactions").delete().eq("user_id", userId).like("plaid_transaction_id", "cron-test-%");
}

test.describe("nightly-snapshot Edge Function", () => {
  test.skip(!process.env.SUPABASE_SERVICE_ROLE_KEY, "SUPABASE_SERVICE_ROLE_KEY not set — skipping cron tests");
  let goalId: string;
  let budgetId: string;
  const TEST_ACCOUNT_ID = "cron-test-account-1";
  const TEST_ITEM_ID    = "cron-test-item-1";

  test.beforeAll(async () => {
    if (!process.env.TEST_EMAIL || !SERVICE_KEY) test.skip();

    // Look up the test user's ID from auth
    const { data: { users } } = await db.auth.admin.listUsers();
    const user = users.find(u => u.email === process.env.TEST_EMAIL);
    if (!user) throw new Error("Test user not found");
    const userId = user.id;

    // Seed: savings goal
    const { data: goal } = await db
      .from("savings_goals")
      .insert({ owner_type: "personal", owner_id: userId, goal_type: "savings", name: "Cron Test Goal", icon: "🧪" })
      .select("id")
      .single();
    if (!goal) throw new Error("Failed to insert test goal");
    goalId = goal.id;

    // Seed: goal_account link
    await db.from("goal_accounts").insert({
      goal_id:          goalId,
      user_id:          userId,
      plaid_account_id: TEST_ACCOUNT_ID,
      plaid_item_id:    TEST_ITEM_ID,
    });

    // Seed: budget covering today, $100 limit, FOOD_AND_DRINK
    const t = today();
    const periodStart = t.slice(0, 7) + "-01";
    const y = parseInt(t.slice(0, 4));
    const m = parseInt(t.slice(5, 7));
    const lastDay = new Date(y, m, 0).getDate();
    const periodEnd = `${t.slice(0, 7)}-${String(lastDay).padStart(2, "0")}`;

    const { data: budget } = await db
      .from("budgets")
      .insert({
        goal_id: goalId, owner_type: "personal", owner_id: userId,
        category_id: "FOOD_AND_DRINK", period_type: "monthly",
        period_start: periodStart, period_end: periodEnd,
        total_limit: 100, recurring: true, rollover_enabled: false, status: "active",
      })
      .select("id")
      .single();
    if (!budget) throw new Error("Failed to insert test budget");
    budgetId = budget.id;

    // Seed: $40 transaction in this period for the linked account
    await db.from("plaid_transactions").insert({
      plaid_transaction_id: "cron-test-tx-1",
      user_id:              userId,
      plaid_account_id:     TEST_ACCOUNT_ID,
      plaid_item_id:        TEST_ITEM_ID,
      category_primary:     "FOOD_AND_DRINK",
      amount:               40,
      date:                 t,
      pending:              false,
      merchant_name:        "Cron Test Grocery",
    });
  });

  test.afterAll(async () => {
    if (!process.env.TEST_EMAIL || !SERVICE_KEY) return;
    const { data: { users } } = await db.auth.admin.listUsers();
    const user = users.find(u => u.email === process.env.TEST_EMAIL);
    if (!user) return;
    await cleanupTestData(goalId, user.id);
  });

  test("writes a snapshot row for the active budget", async () => {
    if (!process.env.TEST_EMAIL || !SERVICE_KEY) test.skip();

    const ctx = await request.newContext();
    const res = await ctx.post(`${FN_BASE}/nightly-snapshot`, {
      headers: { Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
      data: {},
    });

    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.processed).toBeGreaterThanOrEqual(1);

    // Assert snapshot row was written
    const { data: snapshot } = await db
      .from("budget_daily_snapshots")
      .select("amount_spent, remaining_after, days_remaining_after, daily_rate")
      .eq("budget_id", budgetId)
      .eq("date", today())
      .single();

    expect(snapshot).not.toBeNull();
    expect(Number(snapshot!.amount_spent)).toBeCloseTo(40, 1);
    expect(Number(snapshot!.remaining_after)).toBeCloseTo(60, 1);
    expect(snapshot!.days_remaining_after).toBeGreaterThanOrEqual(0);
  });

  test("is idempotent — second call UPSERTs the same row without duplicating", async () => {
    if (!process.env.TEST_EMAIL || !SERVICE_KEY) test.skip();

    const ctx = await request.newContext();
    await ctx.post(`${FN_BASE}/nightly-snapshot`, {
      headers: { Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
      data: {},
    });

    const { count } = await db
      .from("budget_daily_snapshots")
      .select("id", { count: "exact", head: true })
      .eq("budget_id", budgetId)
      .eq("date", today());

    expect(count).toBe(1);
  });
});

test.describe("nightly-budget-reset Edge Function", () => {
  test.skip(!process.env.SUPABASE_SERVICE_ROLE_KEY, "SUPABASE_SERVICE_ROLE_KEY not set — skipping cron tests");
  let goalId: string;
  let budgetId: string;

  test.beforeAll(async () => {
    if (!process.env.TEST_EMAIL || !SERVICE_KEY) test.skip();

    const { data: { users } } = await db.auth.admin.listUsers();
    const user = users.find(u => u.email === process.env.TEST_EMAIL);
    if (!user) throw new Error("Test user not found");
    const userId = user.id;

    // Seed savings goal
    const { data: goal } = await db
      .from("savings_goals")
      .insert({ owner_type: "personal", owner_id: userId, goal_type: "savings", name: "Reset Test Goal", icon: "🔄" })
      .select("id")
      .single();
    if (!goal) throw new Error("Failed to insert test goal");
    goalId = goal.id;

    // Seed budget with period_end = yesterday. The function queries period_end < today
    // (strictly less than), so today's date is never matched; yesterday always is.
    const yesterday = new Date();
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    const yester = yesterday.toISOString().split("T")[0];
    const { data: budget } = await db
      .from("budgets")
      .insert({
        goal_id: goalId, owner_type: "personal", owner_id: userId,
        category_id: "GENERAL_MERCHANDISE", period_type: "monthly",
        period_start: yester, period_end: yester,
        total_limit: 200, recurring: true, rollover_enabled: false, status: "active",
      })
      .select("id")
      .single();
    if (!budget) throw new Error("Failed to insert test budget");
    budgetId = budget.id;
  });

  test.afterAll(async () => {
    if (!process.env.TEST_EMAIL || !SERVICE_KEY) return;
    const { data: { users } } = await db.auth.admin.listUsers();
    const user = users.find(u => u.email === process.env.TEST_EMAIL);
    if (!user) return;
    await cleanupTestData(goalId, user.id);
  });

  test("creates next-period budget and pauses the old one", async () => {
    if (!process.env.TEST_EMAIL || !SERVICE_KEY) test.skip();

    const ctx = await request.newContext();
    const res = await ctx.post(`${FN_BASE}/nightly-budget-reset`, {
      headers: { Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
      data: {},
    });

    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.reset).toBeGreaterThanOrEqual(1);

    // Old budget should now be paused
    const { data: old } = await db
      .from("budgets")
      .select("status")
      .eq("id", budgetId)
      .single();
    expect(old?.status).toBe("paused");

    // A new active budget should exist for this goal
    const { data: next } = await db
      .from("budgets")
      .select("id, period_start, period_end, status")
      .eq("goal_id", goalId)
      .eq("status", "active")
      .single();
    expect(next).not.toBeNull();
    // period_end was yesterday → new period starts today; >= is correct (not strictly >)
    expect(next!.period_start >= today()).toBeTruthy();
  });
});
