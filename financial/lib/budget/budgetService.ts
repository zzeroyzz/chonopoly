import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { BudgetSummary } from "./types";
import { CATEGORY_META } from "../../components/budget/types";
import { sendBudgetWarningEmail, sendBudgetOverEmail } from "./notificationService";
import { RequestContext } from "../context";

function db(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

type BudgetDataResult = {
  summaries: BudgetSummary[];
  totals: { total_budgeted: number; total_spent: number; monthly_income: number };
};
const budgetCache = new Map<string, { data: BudgetDataResult; ts: number }>();
const CACHE_TTL_MS = 60_000;

export function invalidateBudgetCache(ctx: RequestContext) {
  const prefix = `${ctx.type}:${ctx.id}:`;
  for (const key of budgetCache.keys()) {
    if (key.startsWith(prefix)) budgetCache.delete(key);
  }
}

export type PeriodType = "daily" | "weekly" | "monthly" | "quarterly" | "yearly";

const PERIOD_CYCLE: PeriodType[] = ["daily", "weekly", "monthly", "quarterly", "yearly"];
export function nextPeriodType(current: PeriodType): PeriodType {
  return PERIOD_CYCLE[(PERIOD_CYCLE.indexOf(current) + 1) % PERIOD_CYCLE.length];
}

// ─── Period helpers ───────────────────────────────────────────────────────────

function fmtDate(d: Date) {
  return d.toISOString().split("T")[0];
}

export function getPeriodForDate(date: Date, payCycleStartDay: number, periodType: PeriodType = "monthly"): string {
  switch (periodType) {
    case "daily":
      return fmtDate(date);

    case "weekly": {
      const d = new Date(date);
      d.setHours(0, 0, 0, 0);
      const dow = (d.getDay() + 6) % 7;
      d.setDate(d.getDate() - dow);
      const year = d.getFullYear();
      const jan4 = new Date(year, 0, 4);
      const week1Mon = new Date(jan4.getTime() - ((jan4.getDay() + 6) % 7) * 86_400_000);
      const weekNum = Math.floor((d.getTime() - week1Mon.getTime()) / (7 * 86_400_000)) + 1;
      if (weekNum <= 0) return getPeriodForDate(new Date(year - 1, 11, 31), payCycleStartDay, "weekly");
      return `${year}-W${String(weekNum).padStart(2, "0")}`;
    }

    case "quarterly": {
      const q = Math.floor(date.getMonth() / 3) + 1;
      return `${date.getFullYear()}-Q${q}`;
    }

    case "yearly":
      return `${date.getFullYear()}`;

    case "monthly":
    default: {
      const day = date.getDate();
      let year = date.getFullYear();
      let month = date.getMonth();
      if (day < payCycleStartDay) {
        month -= 1;
        if (month < 0) { month = 11; year -= 1; }
      }
      return `${year}-${String(month + 1).padStart(2, "0")}`;
    }
  }
}

export function currentPeriod(payCycleStartDay: number, periodType: PeriodType = "monthly"): string {
  return getPeriodForDate(new Date(), payCycleStartDay, periodType);
}

function periodBounds(period: string, startDay: number, periodType: PeriodType = "monthly"): { start: string; end: string } {
  switch (periodType) {
    case "daily":
      return { start: period, end: period };

    case "weekly": {
      const [yearStr, weekStr] = period.split("-W");
      const year = parseInt(yearStr), week = parseInt(weekStr);
      const jan4 = new Date(year, 0, 4);
      const week1Mon = new Date(jan4.getTime() - ((jan4.getDay() + 6) % 7) * 86_400_000);
      const monday = new Date(week1Mon.getTime() + (week - 1) * 7 * 86_400_000);
      const sunday = new Date(monday.getTime() + 6 * 86_400_000);
      return { start: fmtDate(monday), end: fmtDate(sunday) };
    }

    case "quarterly": {
      const [yearStr, qStr] = period.split("-Q");
      const year = parseInt(yearStr), q = parseInt(qStr);
      const startMonth = (q - 1) * 3;
      return { start: fmtDate(new Date(year, startMonth, 1)), end: fmtDate(new Date(year, startMonth + 3, 0)) };
    }

    case "yearly": {
      const year = parseInt(period);
      return { start: `${year}-01-01`, end: `${year}-12-31` };
    }

    case "monthly":
    default: {
      const [y, m] = period.split("-").map(Number);
      const start = new Date(y, m - 1, startDay);
      const end = new Date(new Date(y, m, startDay).getTime() - 86_400_000);
      return { start: fmtDate(start), end: fmtDate(end) };
    }
  }
}

function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split("T")[0];
}

function periodQueryRange(periodType: PeriodType, startDay: number): { start: string; end: string; daysRemaining: number } {
  const today = daysAgo(0);
  switch (periodType) {
    case "daily":
      return { start: today, end: today, daysRemaining: 0 };
    case "weekly":
      return { start: daysAgo(6), end: today, daysRemaining: 0 };
    case "quarterly":
      return { start: daysAgo(89), end: today, daysRemaining: 0 };
    case "monthly":
    default: {
      const bounds = periodBounds(currentPeriod(startDay, "monthly"), startDay, "monthly");
      const endMs = new Date(bounds.end + "T23:59:59").getTime();
      const daysRemaining = Math.max(0, Math.ceil((endMs - Date.now()) / 86_400_000));
      return { ...bounds, daysRemaining };
    }
  }
}

// ─── User helpers ─────────────────────────────────────────────────────────────

async function getPayCycleStartDay(userId: string): Promise<number> {
  const { data } = await db()
    .from("profiles")
    .select("pay_cycle_start_day")
    .eq("id", userId)
    .single();
  return data?.pay_cycle_start_day ?? 1;
}

// ─── recalculateBudgetPeriod ──────────────────────────────────────────────────
// Snapshot writes are handled by the nightly cron (Step 5).
// For now this just invalidates the cache so the next read computes live.

export async function recalculateBudgetPeriod(
  userId: string,
  ctx: RequestContext,
  _categoryId: string,
  _periodType: PeriodType = "monthly"
): Promise<void> {
  void userId;
  invalidateBudgetCache(ctx);
}

// ─── Notification threshold check ────────────────────────────────────────────
// Called by Step 5 cron — kept here but not triggered until then.

async function checkAndNotify(
  period: { id: string; amount_spent: number; effective_limit: number; notified_80: boolean; notified_over: boolean },
  budget: { id: string; total_limit: number; status?: string },
  userId: string
): Promise<void> {
  if (budget.status === "paused") return;

  const pct = (period.amount_spent / period.effective_limit) * 100;
  const updates: Record<string, boolean> = {};

  const { data: authUser } = await db().auth.admin.getUserById(userId);
  const { data: profile } = await db().from("profiles").select("username").eq("id", userId).single();

  const user = {
    id: userId,
    email: authUser?.user?.email ?? "",
    username: profile?.username ?? null,
    pay_cycle_start_day: 1,
  };

  const budgetWithMeta = {
    ...budget,
    category: { name: "Budget" },
    period,
  };

  if (pct >= 80 && !period.notified_80) {
    sendBudgetWarningEmail(user, budgetWithMeta, pct);
    updates.notified_80 = true;
  }

  if (pct >= 100 && !period.notified_over) {
    sendBudgetOverEmail(user, budgetWithMeta, period.amount_spent - period.effective_limit);
    updates.notified_over = true;
  }

  if (Object.keys(updates).length > 0) {
    await db().from("budget_daily_snapshots").update(updates).eq("id", period.id);
  }
}

// ─── rolloverBudgets ──────────────────────────────────────────────────────────
// Period rollover is handled by the nightly-budget-reset cron in Step 5.

export async function rolloverBudgets(_userId: string): Promise<void> {
  // no-op until Step 5
}

// ─── resolveCategory ─────────────────────────────────────────────────────────
// Single source of truth for effective transaction category.
// override wins over Plaid's primary; null primary maps to "OTHER".
// R3: nightly-snapshot and weekly-report carry inline copies of this logic
// (Deno edge functions cannot import from lib/). Keep all three in sync.
export function resolveCategory(tx: { category_primary: string | null; category_override?: string | null }): string {
  return tx.category_override ?? tx.category_primary ?? "OTHER";
}

// ─── matchesBudget ───────────────────────────────────────────────────────────
// Single filter predicate shared by getBudgetData (spend calc) and
// getBudgetTransactions (detail list). Ensures the sum on the receipt always
// equals the spend figure by construction.

export function matchesBudget(
  tx: { plaid_account_id: string; category_primary: string | null; category_override?: string | null; amount: unknown; date: string },
  categoryId: string,
  periodStart: string,
  periodEnd: string,
  linkedAccountIds: Set<string>
): boolean {
  return (
    Number(tx.amount) > 0 &&
    resolveCategory(tx) === categoryId &&
    tx.date >= periodStart &&
    tx.date <= periodEnd &&
    linkedAccountIds.has(tx.plaid_account_id)
  );
}

export type DetailTxRow = {
  id: string;
  merchant_name: string | null;
  name: string | null;
  date: string;
  amount: number;
};

export async function getBudgetTransactions(
  userId: string,
  ctx: RequestContext,
  budgetId: string,
  periodStart: string,
  periodEnd: string
): Promise<{ transactions: DetailTxRow[]; sum: number }> {
  const { data: budget } = await db()
    .from("budgets")
    .select("goal_id, category_id")
    .eq("id", budgetId)
    .eq("owner_id", ctx.id)
    .eq("owner_type", ctx.type)
    .maybeSingle();

  if (!budget) return { transactions: [], sum: 0 };

  const { data: goalAccountRows } = await db()
    .from("goal_accounts")
    .select("plaid_account_id")
    .eq("goal_id", budget.goal_id);

  const linkedAccountIds = new Set((goalAccountRows ?? []).map((r: { plaid_account_id: string }) => r.plaid_account_id));
  if (linkedAccountIds.size === 0) return { transactions: [], sum: 0 };

  const { data: txRows } = await db()
    .from("plaid_transactions")
    .select("id, merchant_name, name, date, amount, plaid_account_id, category_primary, category_override")
    .eq("user_id", userId)
    .gte("date", periodStart)
    .lte("date", periodEnd)
    .eq("pending", false);

  const matched = (txRows ?? []).filter((tx: { plaid_account_id: string; category_primary: string | null; category_override?: string | null; amount: unknown; date: string }) =>
    matchesBudget(tx, budget.category_id, periodStart, periodEnd, linkedAccountIds)
  );

  const sum = Math.round(matched.reduce((s: number, tx: { amount: unknown }) => s + Number(tx.amount), 0) * 100) / 100;

  const transactions: DetailTxRow[] = matched
    .sort((a: { date: string }, b: { date: string }) => b.date.localeCompare(a.date))
    .map((tx: { id: string; merchant_name: string | null; name: string | null; date: string; amount: unknown }) => ({
      id: tx.id,
      merchant_name: tx.merchant_name ?? null,
      name: tx.name ?? null,
      date: tx.date,
      amount: Number(tx.amount),
    }));

  return { transactions, sum };
}

// ─── getBudgetData ────────────────────────────────────────────────────────────
// Queries new budgets schema. Spending is attributed via goal_accounts →
// plaid_transactions. Uses budget_daily_snapshots when available (written by
// Step 5 nightly cron); falls back to live transaction sum until then.

export async function getBudgetData(
  userId: string,
  ctx: RequestContext,
  _selectedPeriod?: string,
  goalId?: string
): Promise<BudgetDataResult> {
  const cacheKey = `${ctx.type}:${ctx.id}:${_selectedPeriod ?? ""}:${goalId ?? ""}`;
  const hit = budgetCache.get(cacheKey);
  if (hit && Date.now() - hit.ts < CACHE_TTL_MS) return hit.data;

  const today = new Date().toISOString().split("T")[0];
  const budgetsQuery = db()
    .from("budgets")
    .select("id, goal_id, name, category_id, period_type, period_start, period_end, total_limit, rollover_enabled, status")
    .eq("owner_type", ctx.type)
    .eq("owner_id", ctx.id)
    .gte("period_end", today); // exclude cron-retired historical rows; keep manually-paused current-period rows

  const { data: budgets } = await (goalId ? budgetsQuery.eq("goal_id", goalId) : budgetsQuery);

  if (!budgets?.length) {
    return { summaries: [], totals: { total_budgeted: 0, total_spent: 0, monthly_income: 0 } };
  }

  const goalIds = [...new Set(budgets.map(b => b.goal_id))];

  // Fetch linked Plaid accounts for each goal in one query
  const { data: goalAccountRows } = await db()
    .from("goal_accounts")
    .select("goal_id, plaid_account_id")
    .in("goal_id", goalIds);

  const goalAccountMap = new Map<string, Set<string>>();
  for (const row of goalAccountRows ?? []) {
    if (!goalAccountMap.has(row.goal_id)) goalAccountMap.set(row.goal_id, new Set());
    goalAccountMap.get(row.goal_id)!.add(row.plaid_account_id);
  }

  // Transaction query spans the union of all budget periods to avoid N queries
  const queryStart = budgets.map(b => b.period_start).reduce((a, b) => (a < b ? a : b));
  const queryEnd   = budgets.map(b => b.period_end).reduce((a, b) => (a > b ? a : b));

  const [txRes, snapshotResults] = await Promise.all([
    db()
      .from("plaid_transactions")
      .select("plaid_account_id, category_primary, category_override, amount, date")
      .eq("user_id", userId)
      .gte("date", queryStart)
      .lte("date", queryEnd)
      .eq("pending", false),
    Promise.all(
      budgets.map(b =>
        db()
          .from("budget_daily_snapshots")
          .select("amount_spent, remaining_after, days_remaining_after, daily_rate")
          .eq("budget_id", b.id)
          .order("date", { ascending: false })
          .limit(1)
          .maybeSingle()
          .then(r => ({ budgetId: b.id, data: r.data }))
      )
    ),
  ]);

  const allTx = txRes.data ?? [];
  const snapshotMap = new Map(snapshotResults.map(r => [r.budgetId, r.data]));

  const summaries: BudgetSummary[] = budgets.map(b => {
    const linkedAccountIds = goalAccountMap.get(b.goal_id) ?? new Set<string>();
    const snapshot = snapshotMap.get(b.id);
    const meta = CATEGORY_META[b.category_id] ?? CATEGORY_META["OTHER"];

    let amountSpent: number;
    let daysRemaining: number;
    let dailyRate: number;

    if (snapshot) {
      amountSpent = Number(snapshot.amount_spent);
      daysRemaining = snapshot.days_remaining_after;
      dailyRate = Number(snapshot.daily_rate);
    } else {
      // Live fallback: sum transactions within this budget's period from linked accounts
      const periodTx = allTx.filter(tx => matchesBudget(tx, b.category_id, b.period_start, b.period_end, linkedAccountIds));
      amountSpent = periodTx.reduce((s, t) => s + Number(t.amount), 0);
      const endMs = new Date(b.period_end + "T23:59:59").getTime();
      daysRemaining = Math.max(0, Math.ceil((endMs - Date.now()) / 86_400_000));
      const amountRemaining = Math.max(0, Number(b.total_limit) - amountSpent);
      dailyRate = daysRemaining > 0 ? amountRemaining / daysRemaining : 0;
    }

    const effectiveLimit = Number(b.total_limit);
    const amountRemaining = Math.max(0, effectiveLimit - amountSpent);
    const percentUsed = effectiveLimit > 0 ? (amountSpent / effectiveLimit) * 100 : 0;
    const transactionCount = allTx.filter(tx =>
      matchesBudget(tx, b.category_id, b.period_start, b.period_end, linkedAccountIds)
    ).length;

    return {
      budget_id: b.id,
      goal_id: b.goal_id,
      name: (b as unknown as { name?: string | null }).name ?? null,
      category_name: meta.label,
      category_color: meta.hex,
      category_icon: meta.icon,
      total_limit: effectiveLimit,
      effective_limit: effectiveLimit,
      amount_spent: amountSpent,
      amount_remaining: amountRemaining,
      percent_used: Math.round(percentUsed * 10) / 10,
      over_budget: amountSpent > effectiveLimit,
      period_type: b.period_type,
      period_start: b.period_start,
      period_end: b.period_end,
      days_remaining: daysRemaining,
      daily_rate: Math.round(dailyRate * 100) / 100,
      transaction_count: transactionCount,
      notified_80: false,
      notified_over: false,
      nudge_sent: false,
      status: b.status as "active" | "paused",
    };
  });

  const total_budgeted = budgets.reduce((s, b) => s + Number(b.total_limit), 0);
  const total_spent    = summaries.reduce((s, s2) => s + s2.amount_spent, 0);
  const monthly_income = allTx
    .filter(tx => Number(tx.amount) < 0)
    .reduce((s, tx) => s + Math.abs(Number(tx.amount)), 0);

  const result: BudgetDataResult = { summaries, totals: { total_budgeted, total_spent, monthly_income } };
  budgetCache.set(cacheKey, { data: result, ts: Date.now() });
  return result;
}

// ─── getBudgetSummary ─────────────────────────────────────────────────────────

export async function getBudgetSummary(userId: string, ctx: RequestContext, selectedPeriod?: string): Promise<BudgetSummary[]> {
  const { summaries } = await getBudgetData(userId, ctx, selectedPeriod);
  return summaries;
}

// ─── getBudgetTotals ──────────────────────────────────────────────────────────

export async function getBudgetTotals(userId: string, ctx: RequestContext): Promise<{ total_budgeted: number; total_spent: number; monthly_income: number }> {
  const { totals } = await getBudgetData(userId, ctx);
  return totals;
}

// Kept for potential future use; suppress unused-variable warning on helpers.
void periodQueryRange;
void getPayCycleStartDay;
void checkAndNotify;
